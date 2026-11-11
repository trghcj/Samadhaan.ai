"""Builds data/complaints.csv: a SYNTHETIC starter dataset of civic complaints.

Run from the repo root:  python data/build_dataset.py

Layout: 7 classes x 12 base complaints x 3 languages (en / hinglish / hi),
each base complaint plus one lengthened variant = 504 rows.

Split rule: the split is decided per (department, complaint number), so the
English, Hinglish and Hindi versions of the same complaint, and its variant,
always land in the same split. Otherwise a translation of a training example
would leak into the test set.
"""
import csv
import os
import random

SEED = 42
N_TRAIN, N_CALIB, N_TEST = 6, 3, 3  # base complaints per department

# Each department: {language: [12 complaints]}. Index n is the same complaint across languages.
DATA = {
    "Water": {
        "en": [
            "The tap water in our house has stopped coming since morning.",
            "There is no water supply in our area today.",
            "The water from the tap is dirty and smells bad.",
            "A main water pipe is leaking near the bus stop.",
            "Water pressure in our building is very low.",
            "The water tank in our society is not being filled.",
            "Our water meter is not working properly.",
            "Drinking water supply is irregular in our lane.",
            "The pipeline near the park is leaking and wasting water.",
            "We are getting muddy water in the taps.",
            "The public tap in our street is broken.",
            "The water tanker has not come for three days.",
        ],
        "hinglish": [
            "Subah se ghar mein nal mein paani nahi aa raha hai.",
            "Hamare area mein aaj paani ki supply band hai.",
            "Nal ka paani gandha hai aur bahut badbu aa rahi hai.",
            "Bus stop ke paas pani ki badi pipe leak ho rahi hai.",
            "Hamari building mein paani ka pressure bahut kam hai.",
            "Society ki paani ki tanki bhari nahi ja rahi hai.",
            "Hamara water meter sahi se kaam nahi kar raha.",
            "Hamari gali mein peene ke paani ki supply time par nahi aati.",
            "Park ke paas wali pipeline leak ho rahi hai aur paani barbaad ho raha hai.",
            "Nal mein kichad wala paani aa raha hai.",
            "Gali ka public nal toot gaya hai.",
            "Teen din se paani ka tanker nahi aaya.",
        ],
        "hi": [
            "सुबह से घर के नल में पानी नहीं आ रहा है।",
            "हमारे इलाके में आज पानी की सप्लाई बंद है।",
            "नल का पानी गंदा है और उसमें बदबू आ रही है।",
            "बस स्टॉप के पास पानी की मुख्य पाइप लीक हो रही है।",
            "हमारी बिल्डिंग में पानी का दबाव बहुत कम है।",
            "सोसाइटी की पानी की टंकी नहीं भर रही है।",
            "हमारा वॉटर मीटर ठीक से काम नहीं कर रहा है।",
            "हमारी गली में पीने के पानी की सप्लाई समय पर नहीं आती।",
            "पार्क के पास वाली पाइपलाइन लीक हो रही है और पानी बर्बाद हो रहा है।",
            "नल में कीचड़ वाला पानी आ रहा है।",
            "गली का सार्वजनिक नल टूट गया है।",
            "तीन दिन से पानी का टैंकर नहीं आया है।",
        ],
    },
    "Electricity": {
        "en": [
            "There has been a power cut in our area since last night.",
            "The electricity voltage is very low and our appliances are not working.",
            "A live wire is hanging from the electric pole near my house.",
            "The transformer in our colony is making loud sparking noises.",
            "Our electricity bill is much higher than usual.",
            "Frequent power cuts are happening every evening.",
            "The electric meter at my house is faulty.",
            "An electric pole near the school is leaning and may fall.",
            "There is no electricity connection even after applying a month ago.",
            "Sparks are coming from the electrical box on our street.",
            "The power supply keeps tripping whenever it rains.",
            "The electric wires are touching the tree branches near our home.",
        ],
        "hinglish": [
            "Kal raat se hamare area mein bijli nahi hai.",
            "Bijli ka voltage bahut kam hai aur ghar ke upkaran kaam nahi kar rahe.",
            "Mere ghar ke paas bijli ke khambe se khula taar latak raha hai.",
            "Colony ka transformer bahut zor se sparking kar raha hai.",
            "Hamara bijli ka bill bahut zyada aaya hai.",
            "Har shaam bar bar bijli chali jaati hai.",
            "Mere ghar ka bijli meter kharab hai.",
            "School ke paas bijli ka khamba jhuk gaya hai aur gir sakta hai.",
            "Ek mahine pehle apply kiya tha lekin abhi tak bijli connection nahi mila.",
            "Hamari gali ke electric box se chingariyan nikal rahi hain.",
            "Jab bhi baarish hoti hai light trip ho jaati hai.",
            "Bijli ke taar ped ki daaliyon se chhoo rahe hain.",
        ],
        "hi": [
            "कल रात से हमारे इलाके में बिजली नहीं है।",
            "बिजली का वोल्टेज बहुत कम है और घर के उपकरण काम नहीं कर रहे हैं।",
            "मेरे घर के पास बिजली के खंभे से खुला तार लटक रहा है।",
            "कॉलोनी का ट्रांसफॉर्मर बहुत तेज़ आवाज़ के साथ चिंगारी छोड़ रहा है।",
            "हमारा बिजली का बिल बहुत ज़्यादा आया है।",
            "हर शाम बार-बार बिजली चली जाती है।",
            "मेरे घर का बिजली मीटर खराब है।",
            "स्कूल के पास बिजली का खंभा झुक गया है और गिर सकता है।",
            "एक महीने पहले आवेदन किया था लेकिन अभी तक बिजली कनेक्शन नहीं मिला।",
            "हमारी गली के बिजली बॉक्स से चिंगारियां निकल रही हैं।",
            "जब भी बारिश होती है बिजली ट्रिप हो जाती है।",
            "बिजली के तार पेड़ की डालियों को छू रहे हैं।",
        ],
    },
    "Roads": {
        "en": [
            "There is a huge pothole in the middle of the main road.",
            "The road in front of our house is badly damaged.",
            "The newly built road has already developed cracks.",
            "Road repair work has been left incomplete for weeks.",
            "There is no speed breaker near the school and vehicles go very fast.",
            "The footpath near the market is broken and unsafe to walk on.",
            "The road is full of loose gravel and bikes are skidding.",
            "The zebra crossing paint has faded completely at the junction.",
            "A road divider near the flyover is broken.",
            "The road has sunk in one portion after the digging work.",
            "There are no road signs on the highway turn.",
            "The bridge approach road is uneven and dangerous.",
        ],
        "hinglish": [
            "Main road ke beech mein bahut bada gaddha hai.",
            "Hamare ghar ke saamne ki sadak bahut kharab ho gayi hai.",
            "Nayi bani sadak par abhi se dararen pad gayi hain.",
            "Sadak ki marammat ka kaam kai hafton se adhura pada hai.",
            "School ke paas speed breaker nahi hai aur gaadiyan bahut tez chalti hain.",
            "Market ke paas ka footpath toota hua hai aur chalna khatarnak hai.",
            "Sadak par bajri bikhri hai aur bike phisal rahi hain.",
            "Chauraahe par zebra crossing ka rang bilkul mit gaya hai.",
            "Flyover ke paas road divider toot gaya hai.",
            "Khudai ke baad sadak ka ek hissa dhans gaya hai.",
            "Highway ke mod par koi sign board nahi hai.",
            "Pul ke paas ki sadak uneven hai aur khatarnak hai.",
        ],
        "hi": [
            "मुख्य सड़क के बीच में बहुत बड़ा गड्ढा है।",
            "हमारे घर के सामने की सड़क बहुत खराब हो गई है।",
            "नई बनी सड़क पर अभी से दरारें पड़ गई हैं।",
            "सड़क की मरम्मत का काम कई हफ्तों से अधूरा पड़ा है।",
            "स्कूल के पास स्पीड ब्रेकर नहीं है और गाड़ियां बहुत तेज़ चलती हैं।",
            "बाज़ार के पास का फुटपाथ टूटा हुआ है और चलना खतरनाक है।",
            "सड़क पर बजरी बिखरी है और बाइकें फिसल रही हैं।",
            "चौराहे पर ज़ेब्रा क्रॉसिंग का रंग बिल्कुल मिट गया है।",
            "फ्लाईओवर के पास रोड डिवाइडर टूट गया है।",
            "खुदाई के बाद सड़क का एक हिस्सा धंस गया है।",
            "हाईवे के मोड़ पर कोई साइन बोर्ड नहीं है।",
            "पुल के पास की सड़क ऊबड़-खाबड़ है और खतरनाक है।",
        ],
    },
    "Sanitation": {
        "en": [
            "Garbage has not been collected from our street for a week.",
            "The garbage bin near the market is overflowing.",
            "Nobody has come to sweep our street for many days.",
            "Waste is being burnt in the open near our colony.",
            "The public toilet in our area is very dirty and unusable.",
            "Dead animals are lying on the roadside and not being removed.",
            "There is a heap of rubbish near the school gate.",
            "The garbage collection vehicle does not come on time.",
            "Stray dogs are tearing open garbage bags and spreading waste.",
            "Construction debris has been dumped on the vacant plot.",
            "There is no dustbin in our park.",
            "Medical waste is thrown in the open near the clinic.",
        ],
        "hinglish": [
            "Hamari gali se ek hafte se kachra nahi uthaya gaya hai.",
            "Market ke paas ka kachre ka dabba bhar kar bahar gir raha hai.",
            "Kai dino se koi hamari gali mein jhadu lagane nahi aaya.",
            "Colony ke paas khule mein kachra jalaya ja raha hai.",
            "Hamare area ka public toilet bahut gandha hai aur use nahi kar sakte.",
            "Sadak ke kinare mare hue janwar pade hain aur koi nahi utha raha.",
            "School ke gate ke paas kachre ka dher laga hai.",
            "Kachra uthane wali gaadi time par nahi aati.",
            "Awara kutte kachre ke thaile phaad kar kachra faila rahe hain.",
            "Khali plot par malba dump kar diya gaya hai.",
            "Hamare park mein koi dustbin nahi hai.",
            "Clinic ke paas medical kachra khule mein phenka ja raha hai.",
        ],
        "hi": [
            "हमारी गली से एक हफ्ते से कचरा नहीं उठाया गया है।",
            "बाज़ार के पास का कचरे का डिब्बा भरकर बाहर गिर रहा है।",
            "कई दिनों से कोई हमारी गली में झाड़ू लगाने नहीं आया।",
            "कॉलोनी के पास खुले में कचरा जलाया जा रहा है।",
            "हमारे इलाके का सार्वजनिक शौचालय बहुत गंदा है और इस्तेमाल लायक नहीं है।",
            "सड़क किनारे मरे हुए जानवर पड़े हैं और कोई नहीं उठा रहा।",
            "स्कूल के गेट के पास कचरे का ढेर लगा है।",
            "कचरा उठाने वाली गाड़ी समय पर नहीं आती।",
            "आवारा कुत्ते कचरे के थैले फाड़कर कचरा फैला रहे हैं।",
            "खाली प्लॉट पर मलबा डाल दिया गया है।",
            "हमारे पार्क में कोई कूड़ेदान नहीं है।",
            "क्लिनिक के पास मेडिकल कचरा खुले में फेंका जा रहा है।",
        ],
    },
    "Drainage": {
        "en": [
            "The drain in front of our house is blocked and overflowing.",
            "Sewage water is overflowing onto the road.",
            "Rainwater is not draining and has flooded our street.",
            "The manhole cover is missing and it is dangerous.",
            "The open drain near the school is full of waste and stinking.",
            "Sewer line is choked and dirty water is entering our house.",
            "Water is logged in our lane after every small rain.",
            "The drain cover near the market is broken.",
            "The nala behind our colony has not been cleaned for months.",
            "Dirty water from the drain is flowing into the road.",
            "Mosquitoes are breeding in the clogged drain near our house.",
            "The storm water drain is blocked with plastic.",
        ],
        "hinglish": [
            "Hamare ghar ke saamne ki naali jam ho gayi hai aur bahar beh rahi hai.",
            "Sewage ka paani sadak par beh raha hai.",
            "Baarish ka paani nikal nahi raha aur hamari gali mein bhar gaya hai.",
            "Manhole ka dhakkan gayab hai aur bahut khatarnak hai.",
            "School ke paas ki khuli naali kachre se bhari hai aur badbu aa rahi hai.",
            "Sewer line jam hai aur gande paani ghar mein aa raha hai.",
            "Har chhoti baarish ke baad hamari gali mein paani bhar jaata hai.",
            "Market ke paas naali ka dhakkan toot gaya hai.",
            "Colony ke peeche wale nale ki kai mahino se safai nahi hui hai.",
            "Naali ka gandha paani sadak par beh raha hai.",
            "Ghar ke paas jam naali mein machhar panap rahe hain.",
            "Toofani paani ki naali plastic se band ho gayi hai.",
        ],
        "hi": [
            "हमारे घर के सामने की नाली जाम हो गई है और बाहर बह रही है।",
            "सीवेज का पानी सड़क पर बह रहा है।",
            "बारिश का पानी निकल नहीं रहा और हमारी गली में भर गया है।",
            "मैनहोल का ढक्कन गायब है और बहुत खतरनाक है।",
            "स्कूल के पास की खुली नाली कचरे से भरी है और बदबू आ रही है।",
            "सीवर लाइन जाम है और गंदा पानी घर में आ रहा है।",
            "हर छोटी बारिश के बाद हमारी गली में पानी भर जाता है।",
            "बाज़ार के पास नाली का ढक्कन टूट गया है।",
            "कॉलोनी के पीछे वाले नाले की कई महीनों से सफाई नहीं हुई है।",
            "नाली का गंदा पानी सड़क पर बह रहा है।",
            "घर के पास जाम नाली में मच्छर पनप रहे हैं।",
            "तूफानी पानी की नाली प्लास्टिक से बंद हो गई है।",
        ],
    },
    "Street Lights": {
        "en": [
            "The street light in front of our house has not been working for days.",
            "The whole street is dark at night because the lamps are off.",
            "The street lamp keeps flickering all night.",
            "Street lights in our park are not turning on.",
            "The street light stays on during the day and wastes power.",
            "The light pole on our road has no lamp.",
            "There are no street lights on the road to the bus stop and it is unsafe at night.",
            "The street light near the crossing was broken by a truck.",
            "Street lights on the main road are switched off after midnight.",
            "The lamp post light bulb is fused and needs replacement.",
            "The street light near the school is very dim.",
            "New street lights are needed in our dark lane.",
        ],
        "hinglish": [
            "Hamare ghar ke saamne ki street light kai dino se kaam nahi kar rahi.",
            "Raat ko poori gali andheri rehti hai kyunki street light band hain.",
            "Street light poori raat jhapakti rehti hai.",
            "Hamare park ki street lights nahi jal rahi.",
            "Street light din mein bhi jalti rehti hai aur bijli barbaad hoti hai.",
            "Hamari sadak ke khambe par light lagi hi nahi hai.",
            "Bus stop jaane wali sadak par street light nahi hai aur raat ko dar lagta hai.",
            "Chauraahe ke paas ki street light truck se tut gayi hai.",
            "Main road ki street lights aadhi raat ke baad band ho jaati hain.",
            "Street light ka bulb fuse ho gaya hai aur badalna hai.",
            "School ke paas ki street light bahut dim hai.",
            "Hamari andheri gali mein nayi street lights chahiye.",
        ],
        "hi": [
            "हमारे घर के सामने की स्ट्रीट लाइट कई दिनों से काम नहीं कर रही।",
            "रात को पूरी गली अंधेरी रहती है क्योंकि स्ट्रीट लाइटें बंद हैं।",
            "स्ट्रीट लाइट पूरी रात टिमटिमाती रहती है।",
            "हमारे पार्क की स्ट्रीट लाइटें नहीं जल रहीं।",
            "स्ट्रीट लाइट दिन में भी जलती रहती है और बिजली बर्बाद होती है।",
            "हमारी सड़क के खंभे पर लाइट लगी ही नहीं है।",
            "बस स्टॉप जाने वाली सड़क पर स्ट्रीट लाइट नहीं है और रात को डर लगता है।",
            "चौराहे के पास की स्ट्रीट लाइट ट्रक से टूट गई है।",
            "मुख्य सड़क की स्ट्रीट लाइटें आधी रात के बाद बंद हो जाती हैं।",
            "स्ट्रीट लाइट का बल्ब फ्यूज हो गया है और बदलना है।",
            "स्कूल के पास की स्ट्रीट लाइट बहुत धीमी है।",
            "हमारी अंधेरी गली में नई स्ट्रीट लाइटें चाहिए।",
        ],
    },
    "Unclear": {
        "en": [
            "Something is wrong near my house, please send someone.",
            "I have a problem, nobody is listening to me.",
            "The police are not taking my complaint.",
            "My ration card has not been issued yet.",
            "The internet connection in our area is very slow.",
            "There is a lot of noise from the loudspeaker at night.",
            "My neighbour is building illegally on government land.",
            "I want to know about my pension status.",
            "The area smells bad and the situation is terrible.",
            "Please do something about this, it is urgent.",
            "The bus service on our route has stopped.",
            "Hello, can you hear me? I want to complain.",
        ],
        "hinglish": [
            "Mere ghar ke paas kuch gadbad hai, kisi ko bhejiye.",
            "Mujhe pareshani hai, koi meri baat nahi sun raha.",
            "Police meri shikayat nahi likh rahi hai.",
            "Mera ration card abhi tak nahi bana hai.",
            "Hamare area mein internet bahut slow chal raha hai.",
            "Raat ko loudspeaker ka bahut shor hota hai.",
            "Padosi sarkari zameen par avaidh nirman kar raha hai.",
            "Mujhe apni pension ki sthiti jaanni hai.",
            "Area mein badbu hai aur halat bahut kharab hai.",
            "Please is par kuch kijiye, bahut zaroori hai.",
            "Hamare route par bus service band ho gayi hai.",
            "Hello, kya aap sun sakte hain? Mujhe shikayat karni hai.",
        ],
        "hi": [
            "मेरे घर के पास कुछ गड़बड़ है, किसी को भेजिए।",
            "मुझे परेशानी है, कोई मेरी बात नहीं सुन रहा।",
            "पुलिस मेरी शिकायत नहीं लिख रही है।",
            "मेरा राशन कार्ड अभी तक नहीं बना है।",
            "हमारे इलाके में इंटरनेट बहुत धीमा चल रहा है।",
            "रात को लाउडस्पीकर का बहुत शोर होता है।",
            "पड़ोसी सरकारी ज़मीन पर अवैध निर्माण कर रहा है।",
            "मुझे अपनी पेंशन की स्थिति जाननी है।",
            "इलाके में बदबू है और हालत बहुत खराब है।",
            "कृपया इस पर कुछ कीजिए, बहुत ज़रूरी है।",
            "हमारे रूट पर बस सेवा बंद हो गई है।",
            "हेलो, क्या आप सुन सकते हैं? मुझे शिकायत करनी है।",
        ],
    },
}

# Extra sentence appended to make a second, longer version of each complaint.
SUFFIXES = {
    "en": [
        " It has been like this for three days.",
        " Please fix it soon.",
        " This is near the main market.",
        " Many residents of our colony are facing problems.",
    ],
    "hinglish": [
        " Teen din se aisa hi hai.",
        " Please jaldi theek karwaiye.",
        " Ye main market ke paas hai.",
        " Colony ke bahut se log pareshan hain.",
    ],
    "hi": [
        " तीन दिन से ऐसा ही है।",
        " कृपया जल्दी ठीक करवाएं।",
        " यह मुख्य बाज़ार के पास है।",
        " कॉलोनी के बहुत से लोग परेशान हैं।",
    ],
}


def main():
    rng = random.Random(SEED)
    rows = []
    for dept, langs in DATA.items():
        n_items = len(langs["en"])
        assert n_items == N_TRAIN + N_CALIB + N_TEST, dept
        order = list(range(n_items))
        rng.shuffle(order)
        split_of = {}
        for rank, n in enumerate(order):
            if rank < N_TRAIN:
                split_of[n] = "train"
            elif rank < N_TRAIN + N_CALIB:
                split_of[n] = "calibration"
            else:
                split_of[n] = "test"
        for lang, texts in langs.items():
            assert len(texts) == n_items, (dept, lang)
            for n, text in enumerate(texts):
                group = f"{dept.replace(' ', '')}-{n:02d}"
                rows.append((text, lang, dept, group, split_of[n], 0))
                suffix = rng.choice(SUFFIXES[lang])
                rows.append((text + suffix, lang, dept, group, split_of[n], 1))

    rng.shuffle(rows)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "complaints.csv")
    with open(out, "w", newline="", encoding="utf-8-sig") as f:  # BOM so Excel shows Hindi correctly
        w = csv.writer(f)
        w.writerow(["id", "text", "language", "department", "group_id", "split", "is_variant", "source"])
        for i, (text, lang, dept, group, split, variant) in enumerate(rows, 1):
            w.writerow([f"C{i:04d}", text, lang, dept, group, split, variant, "synthetic"])
    print(f"Wrote {len(rows)} rows to {out}")


if __name__ == "__main__":
    main()
