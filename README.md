# Free Burning Cars

3D akční závodní hra do obýváku inspirovaná **Burnin' Rubber 5 Air** z AirConsole.
Hra běží v prohlížeči na PC / televizi, **telefony slouží jako ovladače** (připojí se přes QR kód po domácí Wi-Fi).
Vlastní server v Node.js – není potřeba AirConsole ani internet.

- až **4 hráči** ve split-screenu + AI soupeři (vždy 6 aut na trati)
- **kulomet, rakety, miny, nitro**, opravy – bedny na trati
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

### Když se telefon nepřipojí

- Windows Firewall: při prvním spuštění povol Node.js přístup do **soukromé sítě**.
- PC i telefon musí být ve stejné síti (ne „síť pro hosty", ne mobilní data).
- Adresu jde zadat i ručně: `http://IP-ADRESA-PC:3000/controller.html` (server ji vypíše do konzole).
- Jiný port: `set PORT=3001 && npm run dev`

## Ovládání

**Telefon (na šířku):** levý palec táhne po ploše = zatáčení (analogové), vpravo PLYN, BRZDA (ve stoje zpátečka, v zatáčce drift), PALBA, RAKETA/MINA, NITRO.

**Klávesnice:**

| Klávesa | Akce |
| --- | --- |
| W A S D / šipky | plyn, brzda, zatáčení |
| MEZERNÍK | kulomet |
| F nebo E | raketa / mina |
| SHIFT | nitro |
| ESC | ukončit závod |

**V menu (klávesnice na PC):** `T` trať · `L` počet kol · `O` obtížnost AI · `←/→` výběr auta · `G` kvalita grafiky · `M` zvuk · `F11` celá obrazovka

Tipy: drift (brzda + zatáčení) a zničení soupeře dobíjí nitro. Zelená bedna opravuje, modrá je nitro, červená rakety, oranžová miny.

## Struktura projektu

```
server/index.ts              Express + Socket.IO + Vite; místnosti, přeposílání vstupů z telefonů
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
