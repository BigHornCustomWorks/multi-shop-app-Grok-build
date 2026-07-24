# Custom Shop Management — Setup

Product name shown to users: **Custom Shop Management**  
Platform admin (Master Control only): **BigHornCustomWorks@Gmail.com**

Use a **new Firebase project** (separate from the old single-shop app).

---

## 1. Install Node.js (required once)

1. Download LTS from https://nodejs.org  
2. Install with default options  
3. Open a **new** PowerShell window and check:

```powershell
node -v
npm -v
```

---

## 2. Install app dependencies

```powershell
cd "I:\The Stussis\Documents\Big Horn Custom Works\Shop Management App"
npm install
npm run dev
```

Browser should open `http://localhost:5173`.

---

## 3. Create a new Firebase project

1. Go to https://console.firebase.google.com  
2. **Add project** (e.g. `custom-shop-management`)  
3. Disable Google Analytics if you don’t need it (optional)  
4. Create the project  

### Enable Authentication
1. **Build → Authentication → Get started**  
2. **Sign-in method → Email/Password → Enable → Save**  
3. Password reset emails are sent by Firebase automatically when a user taps **Forgot password?** on the login screen.  
4. Under **Authentication → Settings → Authorized domains**, keep `localhost` for testing and add your live site domain when you deploy.  
5. Admin backup: **Authentication → Users → (user) → ⋮ → Reset password** (or disable the account).

### Create Firestore
1. **Build → Firestore Database → Create database**  
2. Start in **production mode** (we’ll paste rules next)  
3. Pick a region close to you (e.g. `us-central1`)

### Enable Storage
1. **Build → Storage → Get started**  
2. Use default rules for now, then update (below)

### Register a Web app
1. Project settings (gear) → **Your apps → Web** (`</>`)  
2. Nickname: `Custom Shop Management`  
3. Copy the `firebaseConfig` object  

### Connect the app
1. Run the app (`npm run dev`)  
2. Paste the config JSON on the setup screen  
3. Click **Connect Firebase**

---

## 4. Security rules

### Firestore (`Firestore ? Rules`)

Open the project file `firestore.rules` and copy **all** of it into Firebase Console ? **Firestore ? Rules** ? **Publish**.

Important: rules must include the `partRequests` block under each company. If that block is missing, the app shows **"Missing or insufficient permissions"** for parts requests.

Current rules (keep in sync with `firestore.rules`):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function userExists() {
      return exists(/databases/$(database)/documents/users/$(request.auth.uid));
    }

    function userDoc() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    function accountActive() {
      return signedIn() && (
        !userExists()
        || !('active' in userDoc())
        || userDoc().active != false
      );
    }

    function isPlatformAdmin() {
      return accountActive()
        && userExists()
        && userDoc().role == 'platform_admin';
    }

    function isShopAdmin() {
      return accountActive()
        && userExists()
        && userDoc().role == 'shop_admin'
        && userDoc().companyId is string
        && userDoc().companyId.size() > 0;
    }

    function isPartsManager() {
      return accountActive()
        && userExists()
        && userDoc().role == 'parts_manager'
        && userDoc().companyId is string
        && userDoc().companyId.size() > 0;
    }

    /** Shop staff (tech, shop_admin, parts_manager) for this company */
    function sameCompany(companyId) {
      return accountActive()
        && userExists()
        && userDoc().companyId is string
        && userDoc().companyId == companyId;
    }

    /** Anyone who may use part-request inbox / create requests */
    function canUsePartRequests(companyId) {
      return isPlatformAdmin() || sameCompany(companyId);
    }

    match /users/{userId} {
      allow read, create, update: if signedIn() && request.auth.uid == userId && accountActive();
      allow read, update: if isPlatformAdmin();
      allow read, update: if isShopAdmin()
        && resource.data.get('companyId', '') == userDoc().companyId
        && resource.data.get('role', '') != 'platform_admin';
    }

    match /inviteCodes/{code} {
      allow get: if signedIn() && accountActive();
      allow list: if isPlatformAdmin();
      allow create, update, delete: if isPlatformAdmin();
    }

    match /companies/{companyId} {
      allow read, list: if signedIn() && accountActive();

      allow create, delete: if isPlatformAdmin();
      allow update: if isPlatformAdmin()
        || (
          isShopAdmin()
          && userDoc().companyId == companyId
          && request.resource.data.diff(resource.data).affectedKeys()
              .hasOnly(['settings', 'updatedAt'])
        );

      match /jobs/{jobId} {
        allow read, write: if isPlatformAdmin() || sameCompany(companyId);
      }

      /**
       * Part requests — must be published in Firebase Console for the app
       * parts inbox / "Request a part" to work. Without this block, Firestore
       * returns "Missing or insufficient permissions".
       */
      match /partRequests/{requestId} {
        allow read, list: if canUsePartRequests(companyId);
        allow create: if canUsePartRequests(companyId);
        allow update: if canUsePartRequests(companyId);
        allow delete: if isPlatformAdmin()
          || isShopAdmin()
          || (isPartsManager() && userDoc().companyId == companyId);
      }
    }
  }
}

```

**Publish** after pasting. Deactivated users cannot use shop data.

**Platform admin role:** Rules read `users/{uid}.role == 'platform_admin'` from Firestore (not custom claims, not email). The client **never** grants this role. Your existing admin doc must already have `role: "platform_admin"`. If you ever lose it, set that field in Firebase Console → Firestore → `users` → your uid. New staff join via `/api/join-shop` (requires `FIREBASE_SERVICE_ACCOUNT_JSON` on Vercel).

### Storage (`Storage ? Rules`)

Copy from `storage.rules` (or paste below) ? **Storage ? Rules ? Publish**.

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function signedIn() {
      return request.auth != null;
    }

    // Job photos, logos, part-request photos under companies/{companyId}/...
    match /companies/{companyId}/{allPaths=**} {
      allow read: if signedIn();
      allow write: if signedIn()
        && request.resource.size < 15 * 1024 * 1024
        && (
          request.resource.contentType.matches('image/.*')
          || request.resource.contentType == 'application/pdf'
        );
    }
  }
}

```

---

## 5. First login (you)

1. Open the app  
2. **Sign Up** with **BigHornCustomWorks@Gmail.com** and a password  
3. You should land in **Master Control** (not the shop floor)  
4. **Create shop** (e.g. your body shop or a customer)  
5. Upload logo (JPG/PNG), set locations / statuses  
6. Toggle **AI invoice scanner** only for shops that paid for the upgrade  

---

## 6. Shop staff logins

1. Staff **Sign Up** with their own email  
2. They enter the shop **invite code** from Master Control  
3. They only see that shop’s jobs  

---

## 7. AI invoice scanner (optional upgrade)

Uses **xAI Grok vision** (not Gemini) with a body-shop invoice prompt in `src/lib/invoicePrompt.js`.

1. In Master Control, turn on **AI invoice scanner** for that shop  
2. Create an API key at https://console.x.ai/  
3. In the project folder, create `.env`:

```
VITE_XAI_API_KEY=your_xai_key_here
```

(`VITE_GROK_API_KEY` also works as an alias.)

4. Restart `npm run dev`  

Scan pulls line items (parts/labor/sublet), part numbers, qty, and can fill empty customer/vehicle fields. Without the key, manual part entry still works.

---

## 8. Deploy later (when ready)

- Host the web app on **Vercel** (recommended — SMS API lives in `/api`)  
- Customers open a URL on phone/tablet (no App Store required)  
- “Add to Home Screen” for app-like icon  

---

## 9. Customer status SMS (Twilio)

SMS is sent by a **server** function (`/api/send-sms`). Never put Twilio secrets in `VITE_*` vars (those ship to the browser).

### Credentials to use

| Twilio console name | Vercel env var |
|---------------------|----------------|
| Account SID (`AC…`) | `TWILIO_ACCOUNT_SID` |
| Primary Auth Token | `TWILIO_AUTH_TOKEN` |
| Trial / phone number | `TWILIO_FROM_NUMBER` (E.164, e.g. `+15551234567`) |

Optional instead of Auth Token: `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET`.  
Also ensure `VITE_FIREBASE_API_KEY` (or `FIREBASE_WEB_API_KEY`) is set so the API can verify the signed-in user.

### Vercel

1. Project → **Settings → Environment Variables**  
2. Add the three Twilio vars (Production + Preview)  
3. **Redeploy** after saving  
4. Master Control → shop → turn on **Customer status texts (SMS)**  
5. Pick **Text customer on these statuses**  
6. Job: phone + **Allow text updates** → change status or **Text current status now**

### Twilio trial limits

- You can only text **Verified Caller IDs** until you upgrade.  
- Console → Phone Numbers → **Verified Caller IDs** → add your cell, enter the code.  
- **Custom message text is blocked on trial.** Twilio only allows fixed Body templates such as `sms_delivery_updates`.  
- On Vercel add: `TWILIO_TRIAL_MODE` = `true` (and Redeploy). The app will send that template automatically.  
- Optional: `TWILIO_TRIAL_TEMPLATE` = `sms_delivery_updates` (or `sms_account_alerts`, `sms_order_confirmation`, …).  
- **Upgrade Twilio** when you want real shop wording (RO, vehicle, status) to any customer number.  
- After upgrade: set `TWILIO_TRIAL_MODE` = `false` (or delete it) and Redeploy.

---

## Data model (quick reference)

```
users/{uid}
  email, displayName, companyId, role (platform_admin | shop_admin | tech)

companies/{companyId}
  name, inviteCode, branding { logoUrl, primaryColor }
  settings { vehicleLocations, partLocations, repairStatuses, partStatuses, technicians, returnReasons }
  features { invoiceScanner }
  active, allowSelfServeSettings

companies/{companyId}/jobs/{jobId}
  customer, vehicle, RO, repairStatus, vehicleLocation, assignedTech
  parts[] (status + location + returns)
  notes[]
  photos[]
```

---

## Project folder

```
I:\The Stussis\Documents\Big Horn Custom Works\Shop Management App
```
