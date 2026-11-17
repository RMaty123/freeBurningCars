# Free Burning Cars

3D akční závodní hra do obýváku inspirovaná **Burnin' Rubber 5 Air** z AirConsole.
Hra běží v prohlížeči na PC / televizi, **telefony slouží jako ovladače** (připojí se přes QR kód po domácí Wi-Fi).
Vlastní server v Node.js – není potřeba AirConsole ani internet.

- až **4 hráči** ve split-screenu + AI soupeři (vždy 6 aut na trati)
- **kulomet, rakety, miny**, opravy a zrychlení – bedny na trati
- **3 tratě**: Sunset Canyon (poušť při západu slunce), Neon City (noční město), Alpine Rush (les a hory)
- **4 auta** s různými vlastnostmi (Viper GT, Brute V8, Dune Rat, Titan)
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
2. Zadej jméno, vyber auto.
3. První připojený hráč má na telefonu tlačítko **START** (a volbu trati a počtu kol).

Bez telefonu: na obrazovce stiskni **ENTER** (přidá hráče na klávesnici) a znovu **ENTER** (start).

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

**V menu (klávesnice na PC):** `T` trať · `L` počet kol · `O` obtížnost AI · `←/→` výběr auta · `G` kvalita grafiky · `M` zvuk

Bedny: zelená opravuje, červená dává rakety, oranžová miny a **modrá na 5 sekund zrychlí auto 1,7×** (konstanty `BOOST_TIME` a `BOOST_SPEED` v `sim.ts`). Nitro na tlačítko ve hře není.

## Struktura projektu

```
server/index.ts              Express + Socket.IO + Vite; místnosti, přeposílání vstupů z telefonů
server/net.ts                výběr IP adresy pro QR kód (síťovka s výchozí bránou)
client/public/               manifest a ikony ovladače (Přidat na plochu → celá obrazovka)
client/index.html            obrazovka (PC / TV)
client/controller.html       ovladač (telefon)
client/src/shared/           protokol zpráv mezi obrazovkou a ovladačem
client/src/game/             čistá herní logika bez grafiky
    track.ts                 tratě (křivky z řídicích bodů)
    cars.ts                  typy aut a jejich vlastnosti
    sim.ts                   fyzika, zbraně, bedny, kola, pořadí
    ai.ts                    AI soupeři
client/src/render/           Three.js
    world.ts                 vozovka, svodidla, obloha, scenérie podle prostředí
    carModel.ts              procedurální modely aut
    effects.ts               částice (oheň, kouř, jiskry, výbuchy)
    textures.ts              textury kreslené do canvasu
    gameView.ts              scéna, kamery, split-screen
client/src/screen/           hlavní smyčka, lobby, HUD, zvuk (Web Audio)
client/src/controller/       logika ovladače (multi-touch)
scripts/simtest.ts           test simulace bez grafiky
```

Hra (fyzika i grafika) běží v prohlížeči na obrazovce; server jen přeposílá zprávy, aby měly ovladače co nejmenší odezvu.

## Další příkazy

| Příkaz | Co dělá |
| --- | --- |
| `npm run dev` | vývojový server (Vite, změny v kódu se projeví hned) |
| `npm run test:sim` | odjede závody AI na všech tratích bez grafiky a zkontroluje, že auta dojedou |
| `npm run typecheck` | kontrola typů TypeScriptu |
| `npm run build` + `npm run prod` | sestavení do `dist/` a spuštění bez Vite |

Jak přidat trať: do pole `TRACKS` v `client/src/game/track.ts` přidej řídicí body `[x, z]` v metrech (křivka se sama uzavře) a zvol prostředí `desert` / `city` / `forest`. Zatáčky drž s poloměrem aspoň ~25 m a jednotlivé úseky trati aspoň ~40 m od sebe.

V konzoli prohlížeče je pro ladění objekt `fbc` (`fbc.sim`, `fbc.view`, `fbc.players`).

## Stav

Ověřeno: test simulace (AI dojede všechny tratě), kontrola typů, hra v Chrome (lobby, závod, split-screen, výsledky) a ovladač s emulovaným dotykem včetně odpojení a znovupřipojení.
**Neověřeno:** skutečný telefon, výkon na konkrétním PC a `npm run build` / `npm run prod`.
Jízdní vlastnosti a obtížnost jsou vyladěné jen podle simulace – čísla jsou v `cars.ts` a nahoře v `sim.ts`.

Nápady na další rozšíření: kariéra a odemykání aut, další zbraně, převýšení trati, hudba, výběr barvy auta.

## Licence

AGPL-3.0-only – viz soubor `LICENSE`.
