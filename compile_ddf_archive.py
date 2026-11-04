import urllib.request
import json
import os
import re

# We pull metadata from the verified Archive.org collections
COLLECTIONS = [
    'die-drei-fragezeichen', # Has 120 full episodes, 001 upwards
    'dreifragezeichen',      # Has 89 episodes
    'dreifragezeichen-192',  # Folge 192 (all parts)
    'diedreifragezeichen'    # Specials and extra episodes
]

KNOWN_TITLES = {
    1: "und der Super-Papagei",
    2: "und der Phantomsee",
    3: "und der Karpatenhund",
    4: "und die schwarze Katze",
    5: "und der Fluch des Rubins",
    6: "und der sprechende Totenkopf",
    7: "und der unheimliche Drache",
    8: "und der grüne Geist",
    9: "und die rätselhaften Bilder",
    10: "und die flüsternde Mumie",
    11: "und das Gespensterschloss",
    12: "und der seltsame Wecker",
    13: "und der lachende Schatten",
    14: "und das Bergmonster",
    15: "und der rasende Löwe",
    16: "und der Zauberspiegel",
    17: "und die gefährliche Erbschaft",
    18: "und die Geisterinsel",
    19: "und der Teufelsberg",
    20: "und die flammende Spur",
    21: "und der tanzende Teufel",
    22: "und der verschwundene Schatz",
    23: "und das Azteken-Schwert",
    24: "und die silberne Spinne",
    25: "und die singende Schlange",
    26: "und die Silbermine",
    27: "und der magische Kreis",
    28: "und der Doppelgänger",
    29: "Die Original-Musik",
    30: "und das Riff der Haie",
    31: "und das Narbengesicht",
    32: "und der Ameisenmensch",
    33: "und die bedrohte Ranch",
    34: "und der rote Pirat",
    35: "und der Höhlenmensch",
    36: "und das Narbengesicht (Alternativ)",
    37: "und der heimliche Hehler",
    38: "und der unsichtbare Gegner",
    39: "und die Perlenvögel",
    40: "und der Automarder",
    41: "und das Volk der Winde",
    42: "und der weinende Sarg",
    43: "und der Höllenzug",
    44: "und der gestohlene Preis",
    45: "und das Gold der Wikinger",
    46: "und der schrullige Millionär",
    47: "und der giftige Gockel",
    48: "und die gefährlichen Fässer",
    49: "und die Comic-Diebe",
    50: "und der verschwundene Filmstar",
    51: "und der Schatz im Bergsee",
    52: "und der Rabe Rächer",
    53: "und die Musikpiraten",
    54: "und Gefahr im Verzug",
    55: "und die Automarder II",
    56: "und Angriff der Computerviren",
    57: "und Tatort Zirkus",
    58: "und der verrückte Maler",
    59: "und Giftiges Wasser",
    60: "und Dopingmixer",
    61: "und die Rache des Tigers",
    62: "und Spuk im Hotel",
    63: "und Fussball-Gangster",
    64: "und Geisterstadt",
    65: "und Diamantenschmuggel",
    66: "und die Schattenmänner",
    67: "und das Geheimnis der Särge",
    68: "und der Schatz der Mönche",
    69: "und Späte Rache",
    70: "und Schüsse aus dem Dunkeln",
    71: "und die verschwundene Seglerin",
    72: "und der Dreckige Deal",
    73: "und das brennende Schwert",
    74: "und das brennende Schwert II",
    75: "und die Spur des Raben",
    76: "und Stimmen aus dem Nichts",
    77: "und Pistenteufel",
    78: "und das leere Grab",
    79: "und Im Bann des Voodoo",
    80: "und Geheimakte Ufo",
    81: "und Verdeckte Fouls",
    82: "und die Karten des Bösen",
    83: "und der Mann ohne Kopf",
    84: "und Musik des Teufels",
    85: "und Feuerturm",
    86: "und Nacht in Angst",
    87: "und Wolfsgesicht",
    88: "und Vampir im Internet",
    89: "und Tödliche Spur",
    90: "und der Feuerteufel",
    91: "und Labyrinth der Götter",
    92: "und der Todesflug",
    93: "und das Geisterschiff",
    94: "und das schwarze Monster",
    95: "und Botschaft von Geisterhand",
    96: "und die rote Zwille",
    97: "und Insektenstachel",
    98: "und Tal des Schreckens",
    99: "und Rufmord",
    100: "und Totenkopffelsen",
    101: "und das Erbe des Meisterdiebs",
    102: "und Doppelte Täuschung",
    103: "und das Erbe des Meisterdiebs II",
    104: "und Gift per E-Mail",
    105: "und der Nebelfelsen",
    106: "und der Mann ohne Kopf II",
    107: "und der Schatz der Mönche II",
    108: "und die Sieben Tore",
    109: "und Gefährliches Quiz",
    110: "und Panik im Park",
    111: "und die Höhle des Grauens",
    112: "und Schlucht der Dämonen",
    113: "und das Auge des Drachen",
    114: "und die Villa der Toten",
    115: "und Auf tödlichem Kurs",
    116: "und Codename: Cobra",
    117: "und der Finstere Rivale",
    118: "und das Düstere Vermächtnis",
    119: "und der Geheime Schlüssel",
    120: "und der Schwarze Skorpion",
    192: "und Im Bann des Drachen"
}

def clean_umlauts(text):
    if not text: return ""
    text = text.replace('', '')
    text = text.replace('grne', 'grüne').replace('Grne', 'Grüne')
    text = text.replace('Rtsel', 'Rätsel').replace('rtsel', 'rätsel')
    text = text.replace('flster', 'flüster').replace('Flster', 'Flüster')
    text = text.replace('Hrbcher', 'Hörbücher').replace('hrspiel', 'hörspiel')
    text = text.replace('Hrspiele', 'Hörspiele')
    return text.strip()

episodes = {}

for coll in COLLECTIONS:
    url = f"https://archive.org/metadata/{coll}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode('utf-8'))
            files = data.get('files', [])
            mp3s = [f for f in files if f.get('name', '').lower().endswith('.mp3')]
            
            for f in mp3s:
                fname = f.get('name', '')
                title_field = f.get('title', '')
                size = int(f.get('size', 0))
                dur = float(f.get('length', 0)) if f.get('length') else 0
                
                # Check episode number
                m = re.search(r'(?:folge\s*|nr\s*|^)0*(\d{1,3})(?:\D|$)', fname, re.IGNORECASE)
                if not m:
                    m = re.search(r'(?:folge\s*|nr\s*|^)0*(\d{1,3})(?:\D|$)', title_field, re.IGNORECASE)
                
                if m:
                    num = int(m.group(1))
                    if 1 <= num <= 250:
                        # Extract title
                        title = KNOWN_TITLES.get(num)
                        if not title:
                            raw = title_field or fname.replace('.mp3', '')
                            raw = re.sub(r'^(?:Die\s*Drei\s*Fragezeichen\s*[-_ ]*)?(?:Folge\s*)?0*\d{1,3}\s*[-_ ]*', '', raw, flags=re.I)
                            title = clean_umlauts(raw.replace('_', ' '))
                        
                        dl_url = f"https://archive.org/download/{coll}/{urllib.parse.quote(fname)}"
                        
                        # Prefer die-drei-fragezeichen single-file full episodes or higher bitrate
                        if num not in episodes or coll == 'die-drei-fragezeichen':
                            episodes[num] = {
                                'num': num,
                                'numStr': f"{num:03d}",
                                'title': title if title.startswith('und') else f"... {title}",
                                'displayTitle': f"... {title}" if not title.startswith('...') and not title.startswith('und') else title,
                                'url': dl_url,
                                'collection': coll,
                                'filename': fname,
                                'size': size,
                                'duration': dur
                            }
    except Exception as e:
        print(f"Error fetching {coll}: {e}")

out_list = [episodes[k] for k in sorted(episodes.keys())]

out_dir = r"C:\Users\pd\Documents\GitHub\archiv\ddf\data"
os.makedirs(out_dir, exist_ok=True)
out_file = os.path.join(out_dir, "episodes.json")

with open(out_file, 'w', encoding='utf-8') as f:
    json.dump(out_list, f, ensure_ascii=False, indent=2)

print(f"Erfolgreich {len(out_list)} reine Archive.org-Folgen generiert in {out_file}!")
