# Free Burning Cars

3D akční závodní hra do obýváku inspirovaná **Burnin' Rubber 5 Air** z AirConsole.
Hra běží v prohlížeči na PC / televizi, **telefony slouží jako ovladače** (připojí se přes QR kód po domácí Wi-Fi).
Vlastní server v Node.js – není potřeba AirConsole ani internet.

- až **4 hráči** ve split-screenu + AI soupeři (vždy 6 aut na trati)
- **kulomet, rakety, miny**, opravy a zrychlení – bedny na trati
- **3 tratě**: Sunset Canyon (poušť při západu slunce), Neon City (noční město), Alpine Rush (les a hory)
- **12 aut**, která se opravdu jinak řídí – od formule a hypersportu po náklaďák (rozdíl v kole až 1,6×)
- dvoubarevný lak, čtyři povrchy laku, brzdové kotouče s barevnými třmeny – každé auto vypadá jinak
- zničení soupeřů, respawn, pořadí, kola, body za umístění i za zničení
- veškerá grafika i zvuk jsou procedurální (žádné stažené modely, textury ani zvuky)

## Spuštění (Windows)

Potřebuješ [Node.js](https://nodejs.org) verze 18 nebo novější (doporučuju LTS).

```
npm install
npm run dev
```

Pak na PC otevři **http://localhost:3000** (Chrome nebo Edge).

1. Na obrazovce uvidíš QR kód – naskenuj ho telefonem (telefon musí být na **stejné Wi-Fi** jako PC).
2. Zadej jméno. První připojený hráč ovládá menu.
3. **VYBRAT TRAŤ** → na obrazovce se objeví velké karty tratí. Telefonem je posouváš (LEFT / RIGHT), **SELECT** potvrdí, šipka zpět vrací do lobby.
4. **Výběr auta** → každý hráč má na obrazovce vlastní panel s 3D autem a jeho staty. Na telefonu ťukneš na auto v nabídce a pak ho musíš **POTVRDIT** (ZMĚNIT AUTO potvrzení zruší). Až mají potvrzeno všichni, začne závod.
5. Po závodě se hra vrací na výběr tratě.

Bez telefonu: **ENTER** přidá hráče na klávesnici, další **ENTER** otevře výběr tratě a pak výběr auta (všude ←/→, ENTER potvrdí, ESC zpět).

### Adresa v QR kódu

Server se podívá do směrovací tabulky (`route print`) a do QR kódu dá adresu té síťovky, která má **výchozí bránu** – tedy té, kterou je PC připojené k routeru. Virtuální adaptéry (VirtualBox, WSL, Hyper-V…) se tím přeskočí. Pod QR kódem je vidět, která síťovka a brána se použila; totéž vypíše server do konzole.

Kdyby to netrefilo, adresu jde vynutit: `set HOST_IP=192.168.1.50 && npm run dev`

### Celá obrazovka

- **PC:** po prvním kliknutí nebo stisku klávesy se hra sama přepne na celou obrazovku (bez interakce to prohlížeč nedovolí). ESC ji vypne, další klik ji zase zapne.
- **Android:** přepne se po připojení / prvním dotyku a otočí na šířku. Vpravo nahoře je tlačítko **menu (❚❚)** – Pokračovat, Zrušit / zapnout celou obrazovku, Odejít ze hry. Menu otevře i systémové **Zpět**, takže jím omylem neodejdeš ze hry. Když celou obrazovku vypneš, hra ji už sama nezapíná. Ještě lepší je v Chromu dát *⋮ → Přidat na plochu* – ovladač se pak spouští rovnou přes celou obrazovku jako aplikace.
- **iPhone:** Safari celou obrazovku pro webové stránky neumí. Použij *Sdílet → Přidat na plochu* a spouštěj ovladač z ikony na ploše.

### Když se telefon nepřipojí

- Windows Firewall: při prvním spuštění povol Node.js přístup do **soukromé sítě**.
- PC i telefon musí být ve stejné síti (ne „síť pro hosty", ne mobilní data).
- Adresu jde zadat i ručně: `http://IP-ADRESA-PC:3000/controller.html` (server ji vypíše do konzole).
- Jiný port: `set PORT=3001 && npm run dev`

## Ovládání

**Plyn drží hra sama** – jen zatáčíš, brzdíš a střílíš.

**Telefon (na šířku):** nahoře FIRE 1 (kulomet), DRIFT, FIRE 2 (raketa / mina); dole LEFT, BRAKE (podržením couvá), RIGHT.

**Klávesnice:**

| Klávesa | Akce |
| --- | --- |
| A D / šipky vlevo, vpravo | zatáčení |
| S / šipka dolů | brzda, zpátečka |
| MEZERNÍK | kulomet |
| F nebo E | raketa / mina |
| SHIFT | drift |
| ESC | ukončit závod |

**V lobby (klávesnice na PC):** `L` počet kol · `O` obtížnost AI · `G` kvalita grafiky · `M` zvuk

Bedny: zelená opravuje, červená dává rakety, oranžová miny a **modrá na 5 sekund zrychlí auto 1,7×** (konstanty `BOOST_TIME` a `BOOST_SPEED` v `sim.ts`). Nitro na tlačítko ve hře není.

### Auta a jízda

Auta se liší tak, aby to bylo poznat hned v první zatáčce:

| | nejlepší | nejhorší |
| --- | --- | --- |
| rychlost | HYPERION 259 km/h | HAULER 180 km/h |
| zatáčení | DUNE RAT a NEEDLE | HAULER |
| pancíř | HAULER 200 | NEEDLE 70 |

**HYPERION** je hypersport – nejvyšší rychlost a špička skoro ve všem, platí za to jen průměrným
pancířem. **NEEDLE** (formule) s ním na klikaté trati drží krok, ale rozbije se po pár zásazích.

Klíčová je hodnota `steerRef` v `game/content/cars.ts`: **nad touhle rychlostí auto začne nedotáčet**.
Formule zatáčí i ve dvou stech, náklaďák se v té samé zatáčce jen vzepře a jede rovně – před zatáčkou se
musí brzdit. Nízká `grip` (muscle car, hot rod) znamená, že zadek ujíždí; auto se dá krásně driftovat,
ale v zatáčce ho to nese ven.

Další arkádové vychytávky: rozjetý smyk chvíli vydrží, plný plyn ve vysoké rychlosti rozhoupe zadek,
a jakmile pustíš volant, auto se samo srovná po směru jízdy (jinak by se s tlačítky na telefonu
ze smyku skoro nedalo dostat).

**Nárazy neubližují.** Do svodidel se auto jen otře – ztratí rychlost, poškrábe lak, ale životy ne.
Náraz do jiného auta hlavně odhazuje (těžký TITAN odhodí buginu přes půl silnice) a ubere jen pár životů.
Ničí se **zbraněmi**, ne ježděním do zdi.

## Struktura projektu

```
server/index.ts              Express + Socket.IO + Vite; místnosti, přeposílání vstupů z telefonů
server/net.ts                výběr IP adresy pro QR kód (síťovka s výchozí bránou)
client/index.html            obrazovka (PC / TV)
client/controller.html       ovladač (telefon)
client/public/               manifest a ikony ovladače
client/src/shared/           protokol zpráv mezi obrazovkou a ovladačem
client/src/game/             čistá herní logika bez grafiky
    content/tracks.ts        DATA: seznam tratí (sem se přidávají nové)
    content/cars.ts          DATA: seznam aut (sem se přidávají nová)
    cars.ts                  typy pro auta, barvy hráčů
    track.ts                 geometrie trati (křivka, vzorky, nejbližší bod)
    sim.ts                   fyzika, zbraně, bedny, kola, pořadí
    ai.ts                    AI soupeři
client/src/render/           Three.js (svět, modely aut, částice, textury, kamery, split-screen)
    showroom.ts              garáž pro výběr aut + náhledy aut pro telefon
client/src/screen/           obrazovka na PC
    main.ts                  jen propojení: vytvoří App, zaregistruje obrazovky, hlavní smyčka
    app.ts                   společný kontext: grafika, zvuk, ukázka na pozadí, přepínání obrazovek
    session.ts               hráči a spojení s ovladači
    previews.ts              náhledy tratí (vyrenderují se jednou, pak se berou z úložiště prohlížeče)
    screens/lobby.ts         připojení hráčů
    screens/trackSelect.ts   výběr tratě (karty)
    screens/carSelect.ts     výběr aut (panel s 3D autem pro každého hráče)
    screens/race.ts          odpočet, závod, výsledky
    hud.ts, audio.ts         HUD a zvuky
client/src/controller/       logika ovladače
scripts/simtest.ts           test simulace bez grafiky
```

Hra (fyzika i grafika) běží v prohlížeči na obrazovce; server jen přeposílá zprávy.

### Jak se to rozšiřuje

- **Nová trať:** další záznam v `game/content/tracks.ts`. Karta ve výběru, náhled i obrys vzniknou samy.
- **Nové auto:** další záznam v `game/content/cars.ts`. Ve výběru aut se objeví samo – 3D model, dlaždice na telefonu i ukazatele se spočítají z dat. Vzhled skládá `shape` z dílů, žádný soubor s modelem není potřeba:

  | přepínač | co udělá |
  | --- | --- |
  | `nose` | 0 tupá příď dodávky … 1 nízký klín supersportu |
  | `spoiler` | 0 nic, 1 lipa, 2 velké GT křídlo, 3 křídlo na labutích krcích |
  | `flares` | rozšířené blatníky (0–1) |
  | `intakes` | boční sání s lamelami před zadními koly |
  | `scoop` | 1 nasávání na kapotě, 2 kompresor trčící ven |
  | `splitter` | přední splitter a difuzor se žebry |
  | `sideExhaust` | trojice bočních výfuků místo zadních |
  | `rugged` / `bed` / `spare` | offroad rám a rampa / korba / rezerva |
  | `roofless` / `openWheels` | otevřený kokpit / kola mimo karoserii |
  | `lights` | `slim`, `round`, `quad`, `strip` |
  | `livery` | `center`, `twin`, `flash`, `none` (+ `liveryColor`) |
  | `rimSpokes`, `rimColor` | kola (barvy jsou v `RIM` v `game/cars.ts`) |

- **Barvy:** hlavní barva auta je barva hráče, aby šlo poznat, kdo je kdo. K ní má každý typ vlastní **druhou barvu** (`accentColor`) a seznam dílů, které ji dostanou (`accent`: `hood`, `roof`, `flares`, `wing`, `mirrors`, `lower`, `bed`) – PIXIE má bílou střechu jako Mini, SPECTER černou kapotu i střechu, HYPERION karbonové prahy a blatníky. `finish` určuje povrch laku (`gloss`, `matte`, `metallic`, `pearl`), `liveryColor` barvu pruhů a `caliperColor` barvu brzdových třmenů, které jsou vidět mezi paprsky kol. Pojmenované barvy jsou v `PAINT` v `game/cars.ts`.
- **Nový krok v menu (výběr zbraní…):** nový soubor ve `screen/screens/` (stejné rozhraní `Screen` jako `trackSelect.ts`) a jeden řádek `app.register(...)` v `main.ts`. Ovladač se měnit nemusí – obrazovka LEFT / SELECT / RIGHT je obecná a co se vybírá, jí posílá hra (`MenuInfo` v `shared/protocol.ts`).
- **Náhledy tratí** se ukládají do úložiště prohlížeče. Když změníš vzhled hry a chceš je vygenerovat znovu, zvyš `PREVIEW_VERSION` v `previews.ts`.

## Další příkazy

| Příkaz | Co dělá |
| --- | --- |
| `npm run dev` | vývojový server (Vite, změny v kódu se projeví hned) |
| `npm run test:sim` | odjede závody AI se všemi auty na všech tratích bez grafiky a zkontroluje, že dojedou |
| `npm run typecheck` | kontrola typů TypeScriptu |
| `npm run build` + `npm run prod` | sestavení do `dist/` a spuštění bez Vite |

V konzoli prohlížeče je pro ladění objekt `fbc` (`fbc.sim`, `fbc.view`, `fbc.session.players`, `fbc.show('track')`).

## Stav

Ověřeno: test simulace (AI dojede všechny tratě), kontrola typů, hra v Chrome (lobby, závod, split-screen, výsledky) a ovladač s emulovaným dotykem včetně odpojení a znovupřipojení.
**Neověřeno:** skutečný telefon, výkon na konkrétním PC a `npm run build` / `npm run prod`.
Jízdní vlastnosti a obtížnost jsou vyladěné jen podle simulace – čísla jsou v `game/content/cars.ts` a nahoře v `sim.ts`.

Nápady na další rozšíření: kariéra a odemykání aut, další zbraně, převýšení trati, hudba, výběr barvy auta.

## Licence

AGPL-3.0-only – viz soubor `LICENSE`.
