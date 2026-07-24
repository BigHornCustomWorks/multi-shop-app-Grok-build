/**
 * Firestore security rules tests (emulator).
 * Run: npx firebase emulators:exec --only firestore "node scripts/security-rules-tests.mjs"
 *
 * Covers:
 *  - shop user cannot read other shop's company
 *  - shop user cannot self-write role / companyId / active
 *  - shop admin A cannot delete partRequests under shop B
 *  - platform admin can list companies
 *  - own company get allowed when companyId matches
 */

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');

const PROJECT_ID = 'demo-csm-security';

let testEnv;

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'admin1'), {
      email: 'admin@example.com',
      role: 'platform_admin',
      active: true,
    });
    await setDoc(doc(db, 'users', 'techA'), {
      email: 'techa@example.com',
      role: 'tech',
      companyId: 'shopA',
      active: true,
    });
    await setDoc(doc(db, 'users', 'ownerA'), {
      email: 'ownera@example.com',
      role: 'shop_admin',
      companyId: 'shopA',
      active: true,
    });
    await setDoc(doc(db, 'users', 'ownerB'), {
      email: 'ownerb@example.com',
      role: 'shop_admin',
      companyId: 'shopB',
      active: true,
    });
    await setDoc(doc(db, 'users', 'newbie'), {
      email: 'new@example.com',
      jobFilter: 'all',
    });
    await setDoc(doc(db, 'companies', 'shopA'), {
      name: 'Shop A',
      active: true,
      twilioSmsNumber: '+15551111111',
      twilioPhoneSid: 'PN_A',
    });
    await setDoc(doc(db, 'companies', 'shopB'), {
      name: 'Shop B',
      active: true,
      twilioSmsNumber: '+15552222222',
      twilioPhoneSid: 'PN_B',
    });
    await setDoc(doc(db, 'companies', 'shopA', 'partRequests', 'pr1'), {
      partName: 'Door',
      status: 'open',
    });
    await setDoc(doc(db, 'companies', 'shopB', 'partRequests', 'pr2'), {
      partName: 'Fender',
      status: 'open',
    });
    await setDoc(doc(db, 'inviteCodes', 'CODEA1'), {
      companyId: 'shopA',
    });
  });
}

function dbFor(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

async function run() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });

  await seed();

  const results = [];
  async function check(name, fn) {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`PASS  ${name}`);
    } catch (e) {
      results.push({ name, ok: false, error: e.message || String(e) });
      console.error(`FAIL  ${name}`);
      console.error(`      ${e.message || e}`);
    }
  }

  // 4-ish: platform admin lists companies
  await check('platform admin can list companies', async () => {
    const db = dbFor('admin1');
    await assertSucceeds(getDocs(collection(db, 'companies')));
  });

  // 5: shop user cannot read other shop company
  await check('tech A cannot get shop B company (Twilio leak blocked)', async () => {
    const db = dbFor('techA');
    await assertFails(getDoc(doc(db, 'companies', 'shopB')));
  });

  await check('tech A can get own shop A company', async () => {
    const db = dbFor('techA');
    await assertSucceeds(getDoc(doc(db, 'companies', 'shopA')));
  });

  await check('tech A cannot list all companies', async () => {
    const db = dbFor('techA');
    await assertFails(getDocs(collection(db, 'companies')));
  });

  // 6: cannot self-write privileged fields
  await check('user cannot set own role to platform_admin', async () => {
    const db = dbFor('techA');
    await assertFails(
      setDoc(doc(db, 'users', 'techA'), { role: 'platform_admin' }, { merge: true })
    );
  });

  await check('user cannot set own companyId to another shop', async () => {
    const db = dbFor('techA');
    await assertFails(
      setDoc(doc(db, 'users', 'techA'), { companyId: 'shopB' }, { merge: true })
    );
  });

  await check('user cannot set own active to false (self-deactivate bypass)', async () => {
    const db = dbFor('techA');
    await assertFails(setDoc(doc(db, 'users', 'techA'), { active: false }, { merge: true }));
  });

  await check('user can update own displayName', async () => {
    const db = dbFor('techA');
    await assertSucceeds(
      setDoc(
        doc(db, 'users', 'techA'),
        { displayName: 'Tech A', updatedAt: Date.now() },
        { merge: true }
      )
    );
  });

  await check('newbie can create self profile without privileged fields', async () => {
    // already seeded; test create path with a fresh uid
    const db = testEnv.authenticatedContext('freshuser').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'freshuser'), {
        email: 'fresh@example.com',
        displayName: 'Fresh',
        jobFilter: 'all',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
  });

  await check('newbie cannot create self with role platform_admin', async () => {
    const db = testEnv.authenticatedContext('evil').firestore();
    await assertFails(
      setDoc(doc(db, 'users', 'evil'), {
        email: 'evil@example.com',
        role: 'platform_admin',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
  });

  // 7: cross-shop part request delete
  await check('shop admin A cannot delete part request under shop B', async () => {
    const db = dbFor('ownerA');
    await assertFails(deleteDoc(doc(db, 'companies', 'shopB', 'partRequests', 'pr2')));
  });

  await check('shop admin B can delete part request under shop B', async () => {
    const db = dbFor('ownerB');
    await assertSucceeds(deleteDoc(doc(db, 'companies', 'shopB', 'partRequests', 'pr2')));
  });

  await testEnv.cleanup();

  const failed = results.filter((r) => !r.ok);
  console.log('\n--- Summary ---');
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
