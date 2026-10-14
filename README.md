# Apartament 24 — vizualizator și tur 3D

Site static în limba română, pregătit pentru GitHub Pages. Nu necesită instalare, cont pentru vizitatori, chei API sau un proces de compilare. Bibliotecile Three.js 0.180.0 sunt incluse local, cu licența lor; site-ul nu încarcă fonturi sau cod de pe servicii externe.

## Publicare rapidă pe GitHub Pages

1. Creează pe GitHub un depozit numit, de exemplu, `apartament-24`, cu ramura principală `main`.
2. Dezarhivează pachetul. Încarcă **conținutul** folderului site-ului în rădăcina depozitului: `index.html`, `app.js`, `style.css`, `assets/`, `vendor/` și `.nojekyll`. Nu încărca ZIP-ul ca atare și nu pune site-ul într-un subfolder.
3. În depozit, deschide **Settings → Pages**. La **Build and deployment → Source**, selectează **Deploy from a branch**.
4. Alege ramura **main**, folderul **/(root)** și apasă **Save**.
5. Așteaptă finalizarea publicării. Adresa apare în Settings → Pages, în forma `https://NUME-UTILIZATOR.github.io/apartament-24/`.
6. Deschide linkul pe telefon. Poți trimite linkul altor persoane sau îl poți salva pe ecranul principal.

Instrucțiunile GitHub: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

### Alternativă: publicare prin GitHub Actions

Pachetul include `.github/workflows/pages.yml`. Dacă încarci și acest folder ascuns, alege **GitHub Actions** ca sursă în Settings → Pages. Apoi rulează workflow-ul din tabul Actions sau adaugă un commit pe `main`. Alege o singură metodă de publicare. Pentru metoda simplă „Deploy from a branch”, nu încărca folderul `.github`.

## Navigare

- **3D:** un deget rotește; două degete fac zoom și deplasează vederea. Pe calculator, butonul stâng rotește, rotița face zoom, iar butonul drept deplasează vederea.
- **Plan:** vedere de sus, cu etichete; glisarea deplasează planul, iar două degete fac zoom. Atingerea unui spațiu deschide turul lui.
- **Tur:** perspectivă din interior, la o înălțime de privire de 1,60 m. Glisează pentru a privi în jur. Săgețile schimbă încăperea; redarea automată prezintă fiecare spațiu timp de 10 secunde.
- **Cardurile încăperilor:** selectează și apropie încăperea în 3D/Plan sau schimbă punctul de vizitare în Tur.
- **Harta:** atingerea unei încăperi deschide perspectiva ei interioară. Săgeata albă arată direcția privirii.
- **Butonul casă:** revine la încadrarea inițială a modului curent.
- **Butonul de secțiune:** alternează între pereți tăiați și pereți întregi în 3D.
- **Distribuie această vedere:** în fereastra de ajutor, copiază sau trimite un link care păstrează modul și încăperea selectată.
- **Tastatură în Tur:** stânga/dreapta schimbă spațiul, W/A/S/D schimbă direcția privirii, Spațiu pornește sau oprește turul, Escape revine la ansamblu. +/− fac zoom.

Turul folosește puncte de vizitare, cu tranziții discrete între încăperi. Nu include deplasare liberă cu un joystick. Turul automat se oprește la ultima încăpere și la interacțiunea cu vederea sau deschiderea unei ferestre. Preferința „reducerea mișcării” dezactivează rotirea automată și tranzițiile animate.

## Modelul inclus

Geometria web provine din `apartment-model-rhino7.3dm`, citit fără modificarea originalului: 169 de obiecte fizice, 2.940 de triunghiuri, 8 spații. Mesh-ul GLB are 317.208 octeți (~310 KiB). Sunt incluse pereții, podelele, plafoanele, ușile, ferestrele și plintele; curbele și textele de referință sunt excluse. În ansamblu, plafonul este ascuns și pereții sunt secționați pentru a vedea interiorul. În tur, pereții și plafoanele sunt complete.

Suprafețele afișate sunt cele din plan, total 45,11 m². Modelul este o reconstrucție arhitecturală după plan, fără mobilier; înălțimile și unele detalii sunt aproximative. Punctele de vizitare și finisajul de prezentare nu sunt măsurători noi.

Fișierele modelului: `assets/apartment.glb` și `assets/apartment.json`. Pentru alt model, acestea trebuie regenerate împreună, inclusiv punctele de vizitare și poligoanele încăperilor.

## Previzualizare locală

Servește folderul printr-un server HTTP static. De exemplu, dacă ai Python instalat, deschide un terminal în folderul site-ului și rulează:

```text
python -m http.server 8080
```

Apoi deschide `http://localhost:8080`. Dublul clic pe `index.html` nu este suficient: browserul blochează încărcarea modelului pentru paginile deschise direct ca fișiere.

Toate căile sunt relative; site-ul funcționează și la adresa unui depozit GitHub Pages într-un subfolder. Modelul necesită WebGL și un browser actualizat. Dacă WebGL nu este disponibil, pagina oferă un plan 2D.

## Verificare

Verificat în Chrome, cu ecrane simulate de 1440 × 1000, 390 × 844, 844 × 390 și 320 × 568 px. Au trecut verificările pentru încărcarea modelului, toate cele 8 spații, harta, comenzile de tur, avansarea automată și oprirea la ultimul spațiu, zoom cu două degete, linkurile către încăperi, afișarea dintr-un subfolder, preferința de reducere a mișcării și planul de rezervă fără WebGL. Nu au apărut excepții în browser sau cereri către servicii externe. Originalul Rhino are aceeași amprentă SHA-256 înainte și după conversie. Nu a fost făcută o verificare pe un telefon fizic sau în Safari.

## Confidențialitate și licențe

Nu există analiză de trafic, formulare, stocare de profiluri sau cereri către servicii externe. Dacă depozitul și site-ul sunt publice, geometria apartamentului și planul sunt accesibile oricui are linkul. Licența Three.js este în `vendor/THREE-LICENSE.txt`.
