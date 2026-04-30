# 🪙 Finsave — Guide de déploiement

Site de suivi des dépenses → GitHub Pages + Supabase + Google Auth

---

## Étape 1 — Créer le projet Supabase

1. Allez sur [supabase.com](https://supabase.com) → **New project**
2. Notez votre **Project URL** et **anon key** (dans *Settings > API*)
3. Dans **SQL Editor**, collez le contenu de `schema.sql` et cliquez **Run**

---

## Étape 2 — Activer Google Auth dans Supabase

1. Dans Supabase : *Authentication > Providers > Google* → **Enable**
2. Allez sur [console.cloud.google.com](https://console.cloud.google.com)
3. Créez un projet → *APIs & Services > Credentials > OAuth 2.0 Client ID*
   - Application type : **Web application**
   - Authorized redirect URI :
     ```
     https://VOTRE_PROJECT_ID.supabase.co/auth/v1/callback
     ```
4. Copiez le **Client ID** et **Client Secret** dans Supabase *Authentication > Google*
5. Dans Supabase *Authentication > URL Configuration*, ajoutez votre URL GitHub Pages :
   ```
   https://VOTRE_PSEUDO.github.io/budget-tracker/
   ```

---

## Étape 3 — Configurer le projet

Ouvrez `config.js` et remplacez :

```js
const SUPABASE_URL = 'https://VOTRE_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_ANON_KEY';
```

---

## Étape 4 — Déployer sur GitHub Pages

```bash
# Créez un repo sur github.com, puis :
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/VOTRE_PSEUDO/budget-tracker.git
git push -u origin main
```

Ensuite dans GitHub : *Settings > Pages > Source : main branch / root* → **Save**

Votre site sera disponible à :
`https://VOTRE_PSEUDO.github.io/budget-tracker/`

---

## Fichiers du projet

```
budget-tracker/
├── index.html     ← Application complète (HTML)
├── style.css      ← Styles (thème sombre doré)
├── app.js         ← Logique & Supabase
├── config.js      ← Vos clés API (à remplir)
├── schema.sql     ← Base de données (à exécuter dans Supabase)
└── README.md      ← Ce guide
```

---

## Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 🔐 Google Login | Authentification OAuth via Supabase |
| 📊 Dashboard | Résumé mensuel + barres de budget |
| ➕ Ajout rapide | Formulaire simple par catégorie |
| 🏠 Charges fixes | Loyer, abonnements, prélèvements |
| 🏷️ Catégories | Créez les vôtres avec couleur et plafond |
| 📅 Historique | Bilan mois par mois |
| 🔒 Sécurité | Row Level Security → chaque user ne voit que ses données |

---

## Sécurité

- La clé `anon key` est publique par design (Supabase RLS la protège)
- Le Row Level Security empêche tout accès croisé entre utilisateurs
- Ne commettez jamais votre `service_role` key
