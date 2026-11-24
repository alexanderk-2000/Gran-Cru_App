import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gran-cru-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 }
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

describe('firestore.rules', () => {
  it('lets a user read and write their own wines', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/alice/wines/w1'), { user_id: 'alice', name: 'Barolo' }));
    await assertSucceeds(getDoc(doc(db, 'users/alice/wines/w1')));
    await assertSucceeds(updateDoc(doc(db, 'users/alice/wines/w1'), { quantity: 3 }));
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/wines/w1')));
  });

  it("blocks access to another user's data", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/alice/wines/w1'), { user_id: 'alice', name: 'Barolo' });
    });
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(getDoc(doc(bob, 'users/alice/wines/w1')));
    await assertFails(setDoc(doc(bob, 'users/alice/wines/w2'), { user_id: 'bob', name: 'x' }));
    await assertFails(getDoc(doc(bob, 'users/alice')));
  });

  it('blocks unauthenticated access', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'users/alice/wines/w1')));
    await assertFails(setDoc(doc(anon, 'users/alice/wines/w1'), { name: 'x' }));
  });

  it('rejects documents that claim a different owner', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'users/alice/wines/w1'), { user_id: 'bob', name: 'Barolo' }));
    await assertFails(setDoc(doc(db, 'users/alice'), { user_id: 'bob' }));
  });

  it('keeps inventory_events append-only but deletable', async () => {
    const db = env.authenticatedContext('alice').firestore();
    const eventRef = doc(db, 'users/alice/inventory_events/e1');
    await assertSucceeds(setDoc(eventRef, { user_id: 'alice', wine_id: 'w1', type: 'consume', delta: -1 }));
    await assertFails(updateDoc(eventRef, { delta: -5 }));
    await assertSucceeds(deleteDoc(eventRef));
  });

  it('rejects unknown collections', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'users/alice/secrets/s1'), { user_id: 'alice' }));
  });
});

describe('storage.rules', () => {
  const image = new Uint8Array([1, 2, 3]);

  it('lets the owner upload, read and delete wine images', async () => {
    const storage = env.authenticatedContext('alice').storage();
    const imageRef = ref(storage, 'users/alice/wine-images/w1/bottle');
    await assertSucceeds(uploadBytes(imageRef, image, { contentType: 'image/webp' }));
    await assertSucceeds(getBytes(imageRef));
    await assertSucceeds(deleteObject(imageRef));
  });

  it('blocks other users and non-image uploads', async () => {
    const alice = env.authenticatedContext('alice').storage();
    await assertSucceeds(uploadBytes(ref(alice, 'users/alice/wine-images/w1/label'), image, { contentType: 'image/webp' }));

    const bob = env.authenticatedContext('bob').storage();
    await assertFails(getBytes(ref(bob, 'users/alice/wine-images/w1/label')));
    await assertFails(uploadBytes(ref(bob, 'users/alice/wine-images/w1/case'), image, { contentType: 'image/webp' }));
    await assertFails(uploadBytes(ref(alice, 'users/alice/wine-images/w1/case'), image, { contentType: 'text/plain' }));
  });
});
