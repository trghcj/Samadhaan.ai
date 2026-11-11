# Labelling guide

Each complaint gets exactly ONE department. Decide from the problem described, not from where it happens.

| Department | Use when the complaint is about |
|---|---|
| Water | Drinking/tap water supply, pressure, quality, water pipes, tankers, water meters |
| Electricity | Power cuts, voltage, bills, meters, transformers, wires, electric poles |
| Roads | Potholes, damaged roads, footpaths, speed breakers, road markings, signs, dividers, bridges |
| Sanitation | Garbage collection, sweeping, dustbins, public toilets, dead animals, dumped waste |
| Drainage | Drains, sewers, manholes, waterlogging, overflowing sewage, nalas |
| Street Lights | Lamps on public roads: not working, flickering, dim, missing, on in daytime |
| Unclear | Too vague to route, or a matter no listed department handles |

## Tie-break rules

- **Leaking pipe, supply stopped, dirty tap water** -> Water. **Water standing in the street / sewage on the road** -> Drainage.
- **Lamp on a road pole** -> Street Lights. **Live wire, pole, transformer, power cut** -> Electricity.
- **Garbage lying in or blocking a drain** -> label by the main complaint: if the drain is the problem, Drainage; if the rubbish is, Sanitation.
- **Pothole** -> Roads, even if it is full of water.
- **Two departments, no clear main problem** -> Unclear.
- **Not a civic-services matter** (police, ration card, pension, internet, bus service) -> Unclear.
- **Only a feeling or no problem stated** ("something is wrong", "please help") -> Unclear.

## Process for the real dataset

1. Labeller A and labeller B each fill `department` independently, without discussing.
2. Run an agreement check (Cohen's kappa) and list the disagreements.
3. Resolve disagreements using the tie-break rules above, and add a new rule if a pattern keeps coming up.
4. Only the resolved labels go in the final file.
