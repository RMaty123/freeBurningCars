# Free Burnin’n Cars

3D akční závodní hra do obýváku inspirovaná **Burnin' Rubber 5 Air** z AirConsole.
Hra běží v prohlížeči na PC / televizi, **telefony slouží jako ovladače** – naskenují QR kód a jsou ve hře, nic se nikam neopisuje.
Vlastní server v Node.js – není potřeba AirConsole ani internet.

- až **4 hráči** ve split-screenu + **0 až 7 AI soupeřů** podle nastavení (nejvíc 8 aut na trati)
- **4 primární zbraně na výběr** (minigun, těžký kulomet, dvojice laserů na dveřích, EMP vysílač) a **4 sekundární** (naváděné rakety, miny, míčky sypané po osmi, lanový hák), k tomu opravy a zrychlení z beden
- **4 tratě**: Sunset Canyon (poušť při západu slunce), Neon City (noční město), Alpine Rush (les a hory) a Test Strip (osmipruhový testovací ovál)
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
2. Zadej jméno a dej PŘIPOJIT – **žádný kód místnosti se nikam neopisuje**. Telefon se připojí k běžící hře sám; kdyby na síti běželo víc her naráz, rozliší je QR kód. První připojený hráč ovládá menu.
3. **VYBRAT TRAŤ** → na obrazovce se objeví velké karty tratí. Telefonem je posouváš (LEFT / RIGHT), **SELECT** potvrdí, šipka zpět vrací do lobby.
4. **Výběr auta** → každý hráč má na obrazovce vlastní panel s 3D autem a jeho staty. Na telefonu ťukneš na auto v nabídce a pak ho musíš **POTVRDIT** (ZMĚNIT AUTO potvrzení zruší). Až mají potvrzeno všichni, začne závod.
5. Po závodě se hra vrací na výběr tratě.

Bez telefonu: **ENTER** přidá hráče na klávesnici, další **ENTER** otevře výběr tratě a pak výběr auta (všude ←/→, ENTER potvrdí, ESC zpět).

### Adresa v QR kódu a přepínání sítí

Server se podívá do směrovací tabulky (`route print`) a do QR kódu dá adresu té síťovky, která má **výchozí bránu** – tedy té, kterou je PC připojené k routeru. Virtuální adaptéry (VirtualBox, WSL, Hyper-V…) jdou až za ní.

Když má PC víc síťovek (Wi-Fi + kabel, VPN, WSL…), je pod QR kódem nenápadné **„jiná síť ▾"** – rozbalí seznam všech adres a kliknutím (nebo klávesou `N`) přepneš, kterou adresu QR kód nese. Každá síťovka má svůj vlastní QR kód, takže když se telefon přes jednu nepřipojí, zkusíš druhou bez restartu hry. S jedinou síťovkou se přepínač vůbec neukáže.

Adresu jde pořád i vynutit: `set HOST_IP=192.168.1.50 && npm run dev`

### Celá obrazovka

- **PC:** po prvním kliknutí nebo stisku klávesy se hra sama přepne na celou obrazovku (bez interakce to prohlížeč nedovolí). ESC ji vypne, další klik ji zase zapne.
- **Android:** přepne se po připojení / prvním dotyku a otočí na šířku. Vpravo nahoře je tlačítko **menu (❚❚)** – Pokračovat, Zrušit / zapnout celou obrazovku, Odejít ze hry. Menu otevře i systémové **Zpět**, takže jím omylem neodejdeš ze hry. Když celou obrazovku vypneš, hra ji už sama nezapíná. Ještě lepší je v Chromu dát *⋮ → Přidat na plochu* – ovladač se pak spouští rovnou přes celou obrazovku jako aplikace.
- **iPhone:** Safari celou obrazovku pro webové stránky neumí. Použij *Sdílet → Přidat na plochu* a spouštěj ovladač z ikony na ploše.

### Zhasínání obrazovky

Hra si sama drží obrazovku rozsvícenou (Screen Wake Lock), takže při hraní nezhasne ani nenaskočí spořič – na počítači i na telefonu. Zámek se pouští, jen když je okno vidět, a po přepnutí na jinou záložku si ho hra zase vezme.

Na počítači to jede přes `http://localhost:3000`. Kdyby prohlížeč Wake Lock neuměl, zapne se záloha: němé video o velikosti 1 px, které systém bere jako puštěné video a obrazovku nechá svítit. Pokud počítač zhasíná i tak, bývá to nastavením **spánku** ve Windows (Nastavení → Systém → Napájení), které Wake Lock neovlivní – obrazovku udrží, uspání celého PC ne.

### Když se telefon nepřipojí

- Windows Firewall: při prvním spuštění povol Node.js přístup do **soukromé sítě**.
- PC i telefon musí být ve stejné síti (ne „síť pro hosty", ne mobilní data).
- Zkus pod QR kódem jinou síťovku (dlaždice nebo klávesa `N`).
- Adresu jde zadat i ručně: `http://IP-ADRESA-PC:3000/controller.html` (server ji vypíše do konzole).
- Jiný port: `set PORT=3001 && npm run dev`

## Ovládání

**Plyn drží hra sama** – jen zatáčíš, brzdíš a střílíš.

**Telefon (na šířku):** nahoře FIRE 1 (primární zbraň), DRIFT, FIRE 2 (sekundární zbraň); dole LEFT, BRAKE (podržením couvá), RIGHT.

**Dva typy hry – čím se zatáčí.** Přepíná se **jen na PC v hlavním menu** klávesou `T` – mezi *tlačítky* a *náklonem*; na telefonu se to nenastavuje, ovladač se jen přepne podle toho, co je zvolené. Při náklonu se telefon drží na šířku a naklání jako volant; pad se promění na čtyři velká tlačítka (FIRE 1 | FIRE 2 nahoře, DRIFT | BRAKE dole) a uprostřed je vodováha a tlačítko **SROVNAT** (zapamatuje si, jak telefon zrovna držíš – od téhle polohy se měří). Nic dalšího se nenastavuje: rozsah i smysl zatáčení jsou dané.

Náklon čte `deviceorientation`: ±5° kolem nuly je klid, **±46° je plný rejd** (napevno, nenastavuje se), mezi tím mocninná křivka s jemným středem. Výstup hladí adaptivní filtr – v klidu hladí silně, při pohybu se otevře a skoro nezpožďuje – a posílá se zaokrouhlený na 0,01 rovnou z obsluhy senzoru, jen když se změní. Nula se nastaví při zapnutí a znovu na začátku každého závodu. Prohlížeče pouští senzory jen po povolení (na iPhonu je k tomu tlačítko ZAPNOUT NÁKLON v lobby) a **jen na HTTPS nebo localhostu** – když senzor do 1,8 s nic nepošle, ovladač se sám vrátí k tlačítkům a napíše proč.

**Cheaty.** Hlavní vypínač je **jen na počítači** – v hlavním menu klávesou `C`. Na telefonu se nezapínají. Zapnuté cheaty dělají dvě věci:

1. **Vypínač motoru funguje na všech mapách**, ne jen na testovacím placu – `X` na klávesnici i tlačítko START/STOP uprostřed telefonu.
2. **Nabídnou pomocné brzdy (BRAKE ASSIST)** – ty už si ale zapíná **každý hráč sám za sebe**, ne hlavní menu.

**Pomocné brzdy.** Volba každého hráče zvlášť a **ve výchozím stavu vypnuté**. Zapínají se **až za jízdy, přímo na jízdním ovladači** – v žádné nabídce na to volba není. Se zapnutými cheaty přibude na padu nahoře tlačítko **BRZDY VYP / ZAP**, ťuknutím se přepne a zapnuté svítí zeleně; kdo hraje na počítači, mačká `Y` (taky až v závodě). Auto to vezme okamžitě, i uprostřed zatáčky, takže si každý může asistenta zapnout a vypnout kdykoli během závodu – a jeden hráč s ním může jet, zatímco ostatní jedou načisto. Volba se drží do dalšího závodu; v lobby je pak u hráče vidět `· pomocné brzdy`, ale přepnout se tam nedá.

**Jak asistent přemýšlí.** Nejsou to „zapnuté brzdy“, ale tři vrstvy, z nichž vždy platí ta nejpřísnější:

1. **Zatáčka před autem.** Projde křivost trati přesně tak daleko, kolik je *skutečná* brzdná dráha z aktuální rychlosti (ne napevno daných pár desítek metrů), a pro každé místo spočítá, jak rychle se tam dá projet – z boční přilnavosti a z toho, jak ostře auto vůbec umí při té rychlosti zatočit. A počítá se s tím, že **trať je široká**: zatáčka jde projet po mírnějším oblouku, než má její osa, takže asistent nebrzdí na nitku uprostřed. Pak se ptá obráceně, než je zvykem: *kdybych od teď brzdil, jakou rychlostí tam dojedu?* Brzdná dráha zahrnuje i odpor vzduchu, takže sedí i v nitru, kde je auto o 70 % rychlejší.
2. **Stačí pustit plyn?** Mírné zatáčky se vyřídí bez brzdy – asistent jen ubere plyn (nejvýš o 60 % a až když je zatáčka do 45 m). Brzdu vytáhne, až když samotné dojetí setrvačností nestačí. Tohle je rozdíl mezi „auto si kousek ubere“ a „auto mi brzdí pod rukama“.
3. **„Tohle už nevytočím.“** Spočítá, jak ostrý oblouk by auto *teď* muselo opsat, aby se vrátilo na stopu, a porovná to s tím, na co při téhle rychlosti vůbec má volant. Když mu to chybí, brzdí podle velikosti schodku. Tahle vrstva vidí to, co křivost trati před autem nevidí: nájezd zevnitř ven, odhození po zásahu nebo po nárazu, rozjetý zadek. Díky ní může být první vrstva velkorysá – nechá hráče jet rychle a tvrdě se ozve, až když se to vážně nevejde.

Výsledek se **hladí**: nasazuje rychle (9/s), pouští pozvolna (3,5/s), takže auto necukne a nepřepíná se pořád tam a zpět. Když asistent brzdí, **rozsvítí se brzdová světla** a na telefonu se tlačítko BRZDY rozzáří – je vidět, že ubírá auto, ne hráč. **Do driftu nemluví** (podržený DRIFT je úmysl), **po zásahu EMP se vypne** (rušení je zbraň, od té nemá co zachraňovat) a na volné ploše nedělá nic.

Změřeno přes všechny okruhy a všechny typy aut na autě, které drží plyn na podlaze a vůbec nebrzdí (3 kola, průměr):

| řidič | nárazů do mantinelu | síla nárazů | 3 kola |
| --- | --- | --- | --- |
| bez asistenta | 1258 | 20151 | 81,9 s |
| se starým asistentem | 480 | 5212 | 84,5 s |
| **s novým asistentem** | **0** | **0** | **89,6 s** |
| AI řídící se sama (pro srovnání) | 41 | 275 | 88,4 s |

A to samé se **slušným řidičem** (volant řídí AI, plyn pořád na podlaze) – tam je rozdíl nejvíc vidět:

| | nárazů | 3 kola |
| --- | --- | --- |
| se starým asistentem | 330 | 82,4 s |
| **s novým asistentem** | **0** | **85,9 s** |

Čili: kdo umí držet stopu, projede s asistentem celý závod **bez jediného doteku svodidel** a je přitom **rychlejší než AI**, která si rychlost hlídá sama (85,9 s vs. 88,4 s). Kdo stopu neumí, přijde o pár sekund, ale místo 1258 nárazů má nulu. Asistent nejezdí za hráče – jen mu nedovolí nalétnout do zatáčky rychlostí, ze které se nedá ubrzdit.

**Klávesnice:**

| Klávesa | Akce |
| --- | --- |
| A D / šipky vlevo, vpravo | zatáčení |
| S / šipka dolů | brzda, zpátečka |
| Q (nebo MEZERNÍK) | FIRE 1 – vybraná zbraň (u PRISM držením nabíjíš a puštěním vystřelíš, PULSE se nabíjí sám a ťuknutím ho odpálíš) |
| W (nebo SHIFT) | drift |
| E (nebo F) | sekundární zbraň (raketa / mina / míčky / hák) |
| X | vypnout/nastartovat motor (testovací plac; se zapnutými cheaty všude) |
| Y | pomocné brzdy zap/vyp (jen se zapnutými cheaty, vlastní volba, i za jízdy) |
| ESC | ukončit závod |

V lobby navíc: `L` kola, `B` počet AI, `O` obtížnost, `T` typ hry (tlačítka / náklon), `C` cheaty, `Y` pomocné brzdy, `N` síťovka v QR kódu.

Levá ruka tak drží celé ovládání na **Q W A S D** – palec má volný mezerník jako druhou možnost pro střelbu.

**V lobby (klávesnice na PC):** `L` počet kol · `B` počet AI soupeřů · `O` obtížnost AI · `G` kvalita grafiky · `M` zvuk

Počet AI soupeřů jde nastavit od 0 (pak jedou jen připojení hráči) až po tolik, kolik se jich vejde vedle hráčů do osmi aut – na telefonu prvního hráče tlačítky − / + u **SOUPEŘI (AI)**, na PC klávesou `B`. Když se připojí další hráč a místo už není, počet AI se sám sníží.

### Test Strip

Poslední trať v nabídce je **testovací plac**: ovál se dvěma kilometrovými rovinkami, 64 m širokou vozovkou a osmi pruhy (3,8 km na kolo). Je tam schválně skoro pořád rovně, takže auta jedou plným plynem vedle sebe a hlavně se střílí – hodí se na zkoušení aut, zbraní a přestřelek bez zatáček. V testovací simulaci na ní padne čtyřikrát víc ran a aut než na normální trati.

Šířka a pruhy jsou obyčejná data (`width`, `lanes` v `game/content/tracks.ts`), takže stejným způsobem jde přidat jakkoli široká trať – čáry mezi pruhy se dokreslí samy.

### Primární zbraně (FIRE 1)

Po výběru auta přijde **výběr zbraně** – na telefonu mřížka s náhledy, na obrazovce model zbraně a její ukazatele. Zbraň si vybírá každý hráč zvlášť, boti ji dostanou na střídačku.

| Zbraň | Jak střílí | Čísla |
| --- | --- | --- |
| **VULCAN** | rotační minigun, při střelbě se mu točí hlavně, dobře si doměřuje cíl | 1,7 dmg / ránu, 20 ran za sekundu (≈ 34 dmg/s) |
| **BREAKER** | pomalý těžký kulomet, slabší doměřování, velké rány | 13 dmg / ránu, 2,5 rány za sekundu (≈ 32 dmg/s) |
| **PRISM** | **dva lasery na dveřích**, nabíjí se držením FIRE 1 | 110 dmg za zásah, dosah 58 m, nabíjení až 5 s |
| **PULSE** | **EMP vysílač na kapotě**, pustí kruhovou vlnu kolem sebe | 15% šance na roztrhání, jinak 22 dmg + 1,5 s zbláznilého volantu, okruh 42 m, nabíjení 5 s |

PRISM je **boční zbraň**: dvě laserová děla přišroubovaná zvenku na dveřích, vidět přímo na autě (`mount: 'side'`, `twin: true`). **Držením FIRE 1 se nabíjí, puštěním vystřelí** a paprsky pak svítí **stejně dlouho, jak dlouho se nabíjelo** – nejvýš 5 sekund (`BEAM_MAX` v `game/guns.ts`). Pálí obě děla naráz, každé rovně dopředu ze svého ústí; paprsek se zastaví o první auto v cestě a ubírá mu život po celou dobu, co na něm drží, takže se jím dá po soupeři "přejíždět".

Zásah je **jednorázová rána za 110 hp, ne ubírání po kapkách** – stačí po soupeři paprskem řeznout a schytá to celé. Běžná auta (70–100 hp) to tedy sejme na jeden zásah, těžká (BRUTE 120, TRAILBLAZER 130, TITAN 170, HAULER 200) jednu ránu přežijí a padnou druhou. Dokud paprsek na autě drží, další rána přijde až za `rehit` (0,7 s), a počítá se za auto, ne za paprsek – obě děla dohromady tedy nenapočítají dvojnásobek. Bot střílející do hráče dává jako u ostatních zbraní 55 %, takže hráč první ránu přežije.

Dosah paprsku je **58 m** – kratší než u kulometů (95 a 110 m). Není to libovolné číslo: měřením všech zásahů paprskem vyšlo, že 59 % jich padne do 20 m, 90 % do 56 m a dál než 75 m netrefí paprsek nikdy (nemá žádné doměřování, letí přesně tam, kam míří nos auta). PRISM se tedy musí dostat soupeři na dostřel, kde je sám zranitelný.

Čočky děl se během nabíjení postupně rozsvěcují, takže je na autě poznat, že se někdo chystá pálit; ukazatel nabití je i v HUD a na tlačítku FIRE 1 na telefonu.

**Zbraň je vlastnost hráče, ne auta** – každé auto může nosit kteroukoli zbraň a model se mu podle toho změní: kulomety sedí na kapotě, laserová děla na dveřích (a velikost děl se přizpůsobí autu, takže formule nemá na boku kanón z náklaďáku). Stejná dvojice děl je i modelem zbraně v nabídce, takže v menu vidíš přesně to, co ti pak bude koukat ze dveří.

**Doměřování u kulometů:** zbraň si najde cíl v kuželu před autem (`cone`) a natočí hlaveň na místo, kam auto doletí – ale jen částí opravy (`aim`) a nejvýš o `aimMax`. Střely samotné pak letí rovně. Všechno jsou to čísla v `game/content/guns.ts`, takže se dá doměřování komukoli přitvrdit i vypnout (`aim: 0`).

Bedny: zelená opravuje, červená doplňuje munici do FIRE 2 (rakety i miny – podle toho, s čím hráč jede) a **modrá na 5 sekund zrychlí auto 1,7×** (konstanty `BOOST_TIME` a `BOOST_SPEED` v `sim.ts`). Nitro na tlačítko ve hře není.

### PULSE – EMP vlna

PULSE je jediná primární zbraň, která nemíří a nenabíjí se ručně:

1. **Vysílač se dobíjí sám** od startu závodu a pořád dokola – hráč pro to nemusí nic dělat. Jádro na kapotě přitom postupně svítí a v HUD se plní pruh.
2. Po **5 sekundách** je plno: jádro začne pulzovat, ozve se pípnutí a **ťuknutí na FIRE 1** pustí vlnu. Hned po výstřelu se zase začne dobíjet.

Vlna se rozjede z auta do kruhu a za 0,55 s se roztáhne na **42 metrů**. Každé zasažené auto má **15% šanci, že ho vlna rovnou roztrhá**. Původně to bylo 40 %, jenže měření (6 aut se stejnou zbraní, všechny okruhy, 4 seedy) ukázalo, že s tím vlna ničila 13,6 aut za minutu – skoro jako PRISM (15,3), a to se nemusí mířit ani nabíjet. S 15 % je to 9,6/min, tedy kousek nad BREAKERem (7,7). I úplně bez téhle šance je zbraň použitelná (6,9/min), protože 22 dmg v kruhu a zblázněný volant bolí samy o sobě. Kdo přežije, schytá 22 dmg a na **1,5 sekundy se mu zblázní volant**: dostane **tři náhodné šipky po půl sekundě**, takže to může být doleva-doprava-doprava, doprava-doprava-doprava nebo jakákoli jiná kombinace. Po dobu rušení auto neposlouchá hráče ani bota a jede si, kam ho šipky zrovna pošlou. Vlna každého zasáhne jen jednou a svého střelce mine.

Je to tím pádem nejsilnější zbraň ve hře: jedna vlna může v hustém poli sebrat dvě tři auta naráz a nedá se jí uhnout. Cenou je nabíjení – pět sekund, během kterých se nedá dělat nic než jezdit a doufat, že se někdo připlete do dosahu.

Animace je schválně laciná: dva tenké prstence (jeden po zemi, druhý ve výšce aut), které se rozjíždějí ven a cestou blednou. Koule ani průhledná stěna by při aditivním míchání vybílily půl obrazovky, protože kamera bývá vlně přímo v cestě – dva prstence stojí dvě vykreslení a jsou čitelnější.

### Sekundární zbraně (FIRE 2)

Hned po výběru primární zbraně přijde **výběr sekundární zbraně** – stejná obrazovka, jen jiný katalog. Vybírá si ji každý hráč zvlášť, boti ji dostanou na střídačku.

Každá sekundárka má **vlastní barvu**, aby se v HUD i na trati poznaly od sebe na první pohled: rakety jsou **žluté** (olivový trup se žlutými kroužky a černou špičkou), miny **červené** (černé tělo s červeným světýlkem), míčky **bílé** (červeno-bílá koule) a hák **modrý** (ocelová hlavice, modrý naviják). Barva se bere z `color` v `content/secondaries.ts` a používá ji ikonka v HUD i model v nabídce.

| Zbraň | Jak funguje | Zásobník |
| --- | --- | --- |
| **RAKETY** | naváděná raketa dopředu, 58 dmg v poloměru 8,5 m | 2 kusy, bedna přidá 3 (strop 6) |
| **MINY** | pustí minu za auto; kdo na ni najede, schytá 46 dmg v poloměru 6,5 m | 20 kusů, bedna přidá 6 (strop 20) |
| **MÍČKY** | vysype za auto osm malých červeno-bílých míčků, které se rozletí a rozkutálí; jeden dá 9 dmg (pětinu miny) v poloměru 2,2 m | 15 dávek po osmi, bedna přidá 4 (strop 15) |
| **HÁK** | vystřelí lano na 95 m s předstihem na cíl; co zahákne, k tomu tě přitáhne. Sám neubližuje | 4 výstřely, bedna přidá 2 (strop 6) |

Mina se pustí kousek za zadní nárazník a **0,8 s se natahuje** – kdo ji položil, na ni může v klidu najet a **nikdy mu nevybouchne pod koly**. Natažená pak bouchne každému cizímu autu, které se dostane blíž než 2,2 m od jejího středu. Leží 30 sekund a pak sama zmizí, takže se trať nezanese. Výbuch (vlastní i cizí) **zapálí ostatní miny v dosahu**, takže položená hromádka odpálí celá za sebou. Prodleva mezi položeními je 0,22 s, dají se tedy sypat za sebou jako korálky – a protože je jich 20, dá se nimi zaminovat celá zatáčka.

Model miny je stejný v nabídce i na trati: **černý** šestiúhelníkový talíř se šedým víkem a červeným světýlkem uprostřed, které **podle stavu bliká jinak** – nenatažená jen doutná, natažená zvolna pulzuje, zapálená svítí naplno. Na trati se kreslí instancovaně (jedno vykreslení na materiál, ať jich leží kolik chce); min a míčků dohromady nikdy neleží víc než 420 (`MAX_DROPS` v `sim.ts`).

**Míčky** jedou stejným kódem jako miny (oboje je v simulaci `Drop`), jen mají navíc fyziku: při vysypání dostane každý z osmi míčků náhodnou rychlost do vějíře dozadu, kus rychlosti auta a trochu nahoru, pak se odráží od země (tíha 20 m/s², odraz 42 %) a brzdí kutálením, dokud ho tření nezastaví – obvykle do tří sekund, s rozptylem kolem 4–5 metrů. Kutálení se počítá v simulaci (`roll`, `yaw`), takže míčky i na obrazovce poctivě rotují ve směru, kterým letí. Jsou červeno-bílé zhruba půl na půl (červená čepička nahoře i dole, široký pruh kolem rovníku), aby byly na asfaltu vidět z každé strany. Natahují se 0,5 s, leží 22 s a spustí se na 1,2 m.

Jeden míček dá **pětinu miny**. Míčky jsou malé (poloměr 17 cm), takže se do nich hůř trefuje – zato průjezd celou dávkou ubere **zhruba to co jedna mina** (naměřeno 46 hp). Kolik si hráč odnese, záleží na tom, kolika míčky projede. Řetězová reakce z výbuchu platí i pro ně, takže průjezd hromádkou dělá sérii malých ran za sebou. Výbuchy míčků jsou schválně malé: je jich hodně, takže se kreslí bez stínů a s drobným efektem, aby sypání naplno nestálo ani snímek navíc.

**Hák** je jediná sekundárka, která sama nic neubližuje – je to taháč. Vrhač sedí **vpravo na kapotě** (naviják s cívkami a vodicí trubka) a při výstřelu z něj vyletí hlavice se třemi drápy rychlostí 120 m/s. Dokud letí, hledá cizí auto do 6,5 m od sebe; když nic nenajde do 95 metrů, navine se zpátky.

Vrhač **nestřílí tam, kam míří nos auta, ale tam, kde cíl za chvíli bude**. Najde si v kuželu ±23° před sebou nejlepší cíl a vyřeší, kde se jeho dráha protne s letem háku (kvadratická rovnice `|D + V·t| = speed·t` v `interceptDir`). Srovnání výstřelu je omezené na ±29°, takže mířit pořád musíš – doměření jen dorovná to, že cíl mezitím popojel. Co to dělá s úspěšností, změřeno na botech přes všechny tratě:

| | úspěšnost zaháknutí |
| --- | --- |
| krátký dostřel (62 m), bez doměření | 36 % |
| dostřel 95 m, bez doměření | 40 % |
| dostřel 95 m + doměření cíle | 58 % |
| **a k tomu rychlejší hák (120 m/s) a úchyt 6,5 m** | **77 %** |

Rychlejší hák pomáhá dvakrát: je méně času na chybu v předpovědi a cíl mezitím míň stihne zatočit.

Když se zahákne, lano **přitahuje střelce k zaháknutému autu** zrychlením 30 m/s² a zároveň slaběji (22 %) brzdí toho zaháknutého – aby bylo cítit, že ho někdo drží. Nos střelce se při tom sám stáčí po laně, jinak by ho to táhlo bokem. Lano povolí po 2,4 sekundy, při přiblížení na 5,5 m nebo když se soupeř utrhne za dostřel. Tah se v simulaci přičítá až **po** kroku auta – kdyby šel dovnitř fyziky, sežrala by ho boční přilnavost a auto by na laně jen zaskřípělo na místě. Naměřeno: z 29 metrů tě hák dotáhne na 6 metrů za zhruba 1,5 sekundy. Každé auto smí mít ve vzduchu jen jeden hák.

AI zbraň používá podle toho, co dostala: raketu posílá na cíl před sebou, hák na toho, kdo ujíždí (a je dál než 12 m, aby se vyplatil), miny i míčky pouští, až když jí někdo sedí na zadku.

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
server/net.ts                IP adresy pro QR kódy (první je síťovka s výchozí bránou)
client/index.html            obrazovka (PC / TV)
client/controller.html       ovladač (telefon)
client/public/               manifest a ikony ovladače
client/src/shared/           protokol zpráv mezi obrazovkou a ovladačem
client/src/game/             čistá herní logika bez grafiky
    content/tracks.ts        DATA: seznam tratí (sem se přidávají nové)
    content/cars.ts          DATA: seznam aut (sem se přidávají nová)
    content/guns.ts          DATA: seznam zbraní FIRE 1 (sem se přidávají nové)
    content/secondaries.ts   DATA: seznam zbraní FIRE 2 (rakety, miny)
    cars.ts                  typy pro auta, paleta barev
    guns.ts                  typy pro zbraně FIRE 1 (+ pravidla paprsku)
    secondary.ts             typy pro zbraně FIRE 2
    track.ts                 geometrie trati (křivka, vzorky, nejbližší bod)
    sim.ts                   fyzika, zbraně, bedny, kola, pořadí
    ai.ts                    AI soupeři
client/src/render/           Three.js (svět, modely aut, částice, textury, kamery, split-screen)
    gunModel.ts              procedurální modely zbraní FIRE 1 do nabídky
    secModel.ts              modely rakety, miny a míčků (nabídka i to, co leží na trati)
    showroom.ts              garáž pro výběr aut i zbraní + náhledy pro telefon
client/src/screen/           obrazovka na PC
    main.ts                  jen propojení: vytvoří App, zaregistruje obrazovky, hlavní smyčka
    app.ts                   společný kontext: grafika, zvuk, ukázka na pozadí, přepínání obrazovek
    session.ts               hráči a spojení s ovladači
    previews.ts              náhledy tratí (vyrenderují se jednou, pak se berou z úložiště prohlížeče)
    screens/lobby.ts         připojení hráčů
    screens/trackSelect.ts   výběr tratě (karty)
    screens/carSelect.ts     výběr aut (panel s 3D autem pro každého hráče)
    screens/weaponSelect.ts  výběr zbraně FIRE 1 i FIRE 2 (jedna obrazovka, dva kroky)
    screens/race.ts          odpočet, závod, výsledky
    hud.ts, audio.ts         HUD a zvuky
client/src/controller/       logika ovladače
scripts/simtest.ts           test simulace bez grafiky
```

Hra (fyzika i grafika) běží v prohlížeči na obrazovce; server jen přeposílá zprávy.

**Když je odezva v ovladači vysoká, hledej ji v tomhle pořadí:** snímkování obrazovky (prohlížeč zpracuje paket mezi snímky, takže 30 fps = až 33 ms navíc a к tomu ještě vykreslení), režim TV (bez „game mode" přidá televize klidně 50–150 ms), Wi-Fi telefonu (úsporný režim rádia) a až pak síť samotná – přeposlání přes server trvá na localhostu 0,3 ms (měřeno 300 pakety: medián 0,31 ms, 95 % pod 0,57 ms).

### Cesta vstupu z telefonu (proč je odezva krátká)

Ovladač → server → obrazovka → simulace. Na každém kroku se škrtalo, co se dalo:

1. **Telefon počítá v obsluze senzoru**, ne v časovači – mezi pohybem a odeslením není žádné čekání na další tik.
2. **Adaptivní filtr** (`deviceorientation`): v klidu hladí silně, při pohybu se otevře. Skok na plný rejd je na 90 % za ~60 ms, při reálném otočení rukou (~250 ms) nepřidá prakticky nic.
3. **Jeden malý paket**: celý stav ovladače (zatáčení, brzda, tři tlačítka) se balí do jednoho čísla (`packInput` / `unpackInput` v `shared/protocol.ts`) a posílá se událostí `i` – paket má ~14 B místo ~60 B a nic se nestringifikuje. Posílá se jen při změně, v klidu drží pojistka 8 paketů/s, při plném kroucení volantem ~40/s.
4. **Volatile emit**: zastaralý paket se zahodí, místo aby se tlačil ve frontě za novějším.
5. **Vypnutý Nagle** na serveru (`setNoDelay`) – jinak by TCP malé pakety slučoval a přidal desítky ms. Komprese je vypnutá taky.
6. **Odezva se dá změřit**: telefon každou vteřinu pošle `ping`, obrazovka hned odpoví `pong` (odpovídá přímo `session.ts`, ne až herní smyčka) a v liště ovladače svítí odezva v ms – zeleně do 35 ms, žlutě do 80, červeně nad.
7. **Simulace bere vstup hned**: `beforeStep` přepíše vstupy aut těsně před krokem fyziky (max jeden snímek zpoždění) a u plynulého zatáčení (náklon) se volant smí otáčet 24/s místo 5/s, takže rampa, která u tlačítek dělá plynulost za hráče, nepřidává až dvě desetiny vteřiny.

### Jak se to rozšiřuje

- **Nová trať:** další záznam v `game/content/tracks.ts`. Karta ve výběru, náhled i obrys vzniknou samy.
- **Nové auto:** další záznam v `game/content/cars.ts`. Ve výběru aut se objeví samo – 3D model, dlaždice na telefonu i ukazatele se spočítají z dat. Vzhled skládá `shape` z dílů, žádný soubor s modelem není potřeba:

  | přepínač | co udělá |
  | --- | --- |
  | `nose` | 0 tupá příď dodávky … 1 nízký klín supersportu |
  | `spoiler` | 0 nic, 1 lipa, 2 velké GT křídlo, 3 křídlo na labutích krcích, 4 vysoké rovné křídlo na stojkách |
  | `flares` | rozšířené blatníky (0–1) |
  | `intakes` | boční sání s lamelami před zadními koly |
  | `scoop` | 1 nasávání na kapotě, 2 kompresor trčící ven |
  | `splitter` | přední splitter a difuzor se žebry |
  | `sideExhaust` | chromovaný svod podél prahu místo zadních výfuků |
  | `deckVents` / `roofScoop` | lamely na víku motoru / hřeben ze střechy na víko |
  | `rugged` / `bed` / `spare` | offroad rám a rampa / korba / rezerva |
  | `roofless` / `openWheels` | otevřený kokpit / kola mimo karoserii |
  | `lights` | `slim`, `round`, `quad`, `strip` |
  | `livery` | `center`, `twin`, `flash`, `none` (+ `liveryColor`) |
  | `rimSpokes`, `rimColor`, `rimCap` | kola: počet paprsků (hodně = tenké), barva z `RIM`, středová krytka v barvě vozu |

- **Barvy:** každý typ auta má **svoji pevnou barvu** (`color` v `content/cars.ts`) – stejnou pro hráče i pro boty, takže VIPER GT je vždy červená, HYPERION světle modrý, HAULER bílý atd. Barva patří vozu, ne hráči: i když si dva hráči vyberou stejné auto, obě jedou ve stejné barvě (`carColor()` vrací prostě barvu typu). Kdo je kdo se pozná podle barvy jména nad autem, tečky na minimapě a rámečku v HUD – to je `tagColor` (barva slotu hráče z `PLAYER_COLORS`), která je oddělená od barvy laku. K hlavní barvě má každý typ vlastní **druhou barvu** (`accentColor`) a seznam dílů, které ji dostanou (`accent`: `hood`, `roof`, `flares`, `wing`, `mirrors`, `lower`, `bed`, `spine`) – PIXIE má bílou střechu jako Mini, SPECTER černou kapotu i střechu, HYPERION grafitový hřbet (`spine` = klín na kapotě + víko motoru, k tomu střecha). `finish` určuje povrch laku (`gloss`, `matte`, `metallic`, `pearl`), `liveryColor` barvu pruhů a `caliperColor` barvu brzdových třmenů, které jsou vidět mezi paprsky kol. Pojmenované barvy jsou v `PAINT` v `game/cars.ts`.
- **Maska a světla** sedí na šikmém čele samy: `noseAt()` v `carModel.ts` spočítá bod a sklon přídě, takže ani u ostrého klínu nic netrčí z karoserie.
- **Nová zbraň:** další záznam v `game/content/guns.ts`. Objeví se sama ve výběru na PC i na telefonu (model do nabídky se poskládá podle `shape`: tělo, hlaveň, chladicí plášť s dírami, úsťová brzda, bedna s municí, energetické prstence) a simulace si z ní vezme čísla. `kind: 'bullet'` střílí projektily, `kind: 'beam'` se nabíjí a pak drží paprsek; `mount` říká, kde zbraň na autě sedí (`hood` = kulomety na kapotě, `side` = děla na dveřích) a `twin: true` střílí z obou stran naráz.
- **Nová sekundární zbraň:** další záznam v `game/content/secondaries.ts` – objeví se sama ve výběru na PC i na telefonu. Chování se liší podle `id` (`rocket` letí dopředu a navádí se, `mine` zůstane ležet, `ball` se rozletí a kutálí, `hook` táhne na laně); model do nabídky je v `render/secModel.ts`.
- **Nový krok v menu:** nový soubor ve `screen/screens/` (stejné rozhraní `Screen` jako `weaponSelect.ts`) a jeden řádek `app.register(...)` v `main.ts`. Nabídka na telefonu je obecná – mřížka s náhledy se staví ze zpráv `catalog` (`kind` říká, co se vybírá), takže pro výběr další věci stačí posílat jiný katalog.
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

Nápady na další rozšíření: kariéra a odemykání aut, další zbraně, převýšení trati, hudba, vlastní lak nad barvu typu.

## Licence

AGPL-3.0-only – viz soubor `LICENSE`.
