"""Fine-tune MuRIL on data/complaints.csv and save per-complaint class probabilities.

Run on a GPU (Google Colab / Kaggle):
    pip install -r research/requirements.txt
    python research/train_muril.py

What it does
  - trains on rows with split == "train"
  - uses a FIXED number of epochs (no early stopping), so the calibration and
    test rows are never used to choose anything about the model
  - writes softmax probabilities for the calibration and test rows, which the
    confidence / conformal / router steps read later

Outputs (in --out):
  probs_calibration.csv, probs_test.csv, metrics.json, model/ (weights)
"""
import argparse
import csv
import json
import os
import random

import numpy as np
import torch
from sklearn.metrics import accuracy_score, f1_score
from torch.utils.data import DataLoader
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

LABELS = ["Water", "Electricity", "Roads", "Sanitation", "Drainage", "Street Lights", "Unclear"]
LABEL2ID = {l: i for i, l in enumerate(LABELS)}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def load_rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def encode(tokenizer, rows, max_len):
    enc = tokenizer([r["text"] for r in rows], truncation=True, max_length=max_len, padding="max_length", return_tensors="pt")
    labels = torch.tensor([LABEL2ID[r["department"]] for r in rows])
    return list(zip(enc["input_ids"], enc["attention_mask"], labels))


def collate(batch):
    ids, mask, y = zip(*batch)
    return torch.stack(ids), torch.stack(mask), torch.stack(y)


@torch.no_grad()
def predict_probs(model, data, device, batch_size):
    model.eval()
    out = []
    for ids, mask, _ in DataLoader(data, batch_size=batch_size, collate_fn=collate):
        logits = model(input_ids=ids.to(device), attention_mask=mask.to(device)).logits
        out.append(torch.softmax(logits, dim=-1).cpu().numpy())
    return np.concatenate(out)


def write_probs(path, rows, probs):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["id", "language", "true", "pred", "confidence"] + [f"p_{l}" for l in LABELS])
        for r, p in zip(rows, probs):
            k = int(p.argmax())
            w.writerow([r["id"], r["language"], r["department"], LABELS[k], f"{p[k]:.6f}"] + [f"{x:.6f}" for x in p])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(ROOT, "data", "complaints.csv"))
    ap.add_argument("--out", default=os.path.join(ROOT, "research", "outputs", "muril"))
    ap.add_argument("--model", default="google/muril-base-cased")
    ap.add_argument("--epochs", type=int, default=20)  # 5 left the model at ~chance (conf ~0.15 for 7 classes)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--max_len", type=int, default=64)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    set_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device: {device}")
    os.makedirs(args.out, exist_ok=True)

    rows = load_rows(args.data)
    by_split = {s: [r for r in rows if r["split"] == s] for s in ("train", "calibration", "test")}
    print({s: len(v) for s, v in by_split.items()})

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model, num_labels=len(LABELS), id2label=dict(enumerate(LABELS)), label2id=LABEL2ID
    ).to(device)

    data = {s: encode(tokenizer, v, args.max_len) for s, v in by_split.items()}
    loader = DataLoader(data["train"], batch_size=args.batch, shuffle=True, collate_fn=collate)

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    total = len(loader) * args.epochs
    sched = get_linear_schedule_with_warmup(opt, int(0.1 * total), total)

    for epoch in range(1, args.epochs + 1):
        model.train()
        running = 0.0
        for ids, mask, y in loader:
            loss = model(input_ids=ids.to(device), attention_mask=mask.to(device), labels=y.to(device)).loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            opt.zero_grad()
            running += loss.item()
        print(f"epoch {epoch}/{args.epochs}  train loss {running / len(loader):.4f}")

    metrics = {"model": args.model, "epochs": args.epochs, "lr": args.lr, "seed": args.seed}
    for split in ("calibration", "test"):
        probs = predict_probs(model, data[split], device, args.batch)
        y_true = [LABEL2ID[r["department"]] for r in by_split[split]]
        y_pred = probs.argmax(axis=1)
        metrics[split] = {
            "n": len(y_true),
            "accuracy": float(accuracy_score(y_true, y_pred)),
            "macro_f1": float(f1_score(y_true, y_pred, average="macro")),
        }
        write_probs(os.path.join(args.out, f"probs_{split}.csv"), by_split[split], probs)
        print(split, metrics[split])

    with open(os.path.join(args.out, "metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)
    model.save_pretrained(os.path.join(args.out, "model"))
    tokenizer.save_pretrained(os.path.join(args.out, "model"))
    print(f"saved to {args.out}")


if __name__ == "__main__":
    main()
