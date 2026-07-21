import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { getFirebase, isFirebaseReady, loadFirebaseConfig, initFirebase } from '../lib/firebase';
import {
  ensureUserProfile,
  subscribeCompany,
  subscribeUserProfile,
  isPlatformAdminEmail,
  isUserAccountActive,
  updateUserJobFilter,
} from '../lib/api';
import { ROLES } from '../lib/constants';

const AuthContext = createContext(null);

const DEACTIVATED_MSG =
  'This account has been deactivated. Contact your shop administrator or platform owner.';

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [firebaseOk, setFirebaseOk] = useState(isFirebaseReady());
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!firebaseOk) {
      setLoading(false);
      setReady(true);
      return undefined;
    }

    const { auth } = getFirebase();
    if (!auth) {
      setLoading(false);
      setReady(true);
      return undefined;
    }

    let unsubCompany = () => {};
    let unsubProfile = () => {};

    const kickDeactivated = async (message) => {
      unsubCompany();
      unsubProfile();
      unsubCompany = () => {};
      unsubProfile = () => {};
      setUser(null);
      setProfile(null);
      setCompany(null);
      setError(message || DEACTIVATED_MSG);
      setLoading(false);
      setReady(true);
      try {
        await signOut(auth);
      } catch {
        /* ignore */
      }
    };

    const unsubAuth = onAuthStateChanged(auth, async (usr) => {
      setLoading(true);
      setError(null);
      unsubCompany();
      unsubProfile();
      unsubCompany = () => {};
      unsubProfile = () => {};

      if (!usr) {
        setUser(null);
        setProfile(null);
        setCompany(null);
        setLoading(false);
        setReady(true);
        return;
      }

      try {
        setUser(usr);
        const p = await ensureUserProfile(usr);

        if (!isUserAccountActive(p)) {
          await kickDeactivated(DEACTIVATED_MSG);
          return;
        }

        setProfile(p);

        // Live profile: kick immediately if admin deactivates while signed in
        unsubProfile = subscribeUserProfile(
          usr.uid,
          (live) => {
            if (!live) return;
            if (!isUserAccountActive(live)) {
              kickDeactivated(DEACTIVATED_MSG);
              return;
            }
            setProfile(live);
          },
          (err) => console.error(err)
        );

        if (p.companyId) {
          unsubCompany = subscribeCompany(
            p.companyId,
            (c) => {
              setCompany(c);
              setLoading(false);
              setReady(true);
            },
            (err) => {
              console.error(err);
              setError(err.message);
              setLoading(false);
              setReady(true);
            }
          );
        } else {
          setCompany(null);
          setLoading(false);
          setReady(true);
        }
      } catch (err) {
        console.error(err);
        setError(err.message || String(err));
        setLoading(false);
        setReady(true);
      }
    });

    return () => {
      unsubAuth();
      unsubCompany();
      unsubProfile();
    };
  }, [firebaseOk]);

  const connectFirebase = (config) => {
    initFirebase(config);
    setFirebaseOk(true);
  };

  const login = async (email, password) => {
    const { auth } = getFirebase();
    await signInWithEmailAndPassword(auth, email.trim(), password);
    // Deactivation is enforced in onAuthStateChanged after profile load
  };

  const signup = async (email, password, displayName) => {
    const { auth } = getFirebase();
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (displayName) await updateProfile(cred.user, { displayName });
    await ensureUserProfile(cred.user);
  };

  const logout = async () => {
    const { auth } = getFirebase();
    await signOut(auth);
    setError(null);
  };

  /** Email the user a Firebase password-reset link. */
  const resetPassword = async (email) => {
    const { auth } = getFirebase();
    const trimmed = email.trim();
    if (!trimmed) throw new Error('Enter your email address.');
    await sendPasswordResetEmail(auth, trimmed);
  };

  /** Save dashboard filter on the user profile (Firestore). */
  const setJobFilter = async (jobFilter) => {
    if (!user?.uid) return;
    const value = jobFilter || 'all';
    setProfile((prev) => (prev ? { ...prev, jobFilter: value } : prev));
    try {
      await updateUserJobFilter(user.uid, value);
    } catch (err) {
      console.error('Failed to save job filter', err);
      setError(err.message || 'Could not save filter preference');
    }
  };

  const isPlatformAdmin =
    profile?.role === ROLES.PLATFORM_ADMIN || isPlatformAdminEmail(user?.email);

  const isShopAdmin = !isPlatformAdmin && profile?.role === ROLES.SHOP_ADMIN;
  /** Shop Owner — same as shop_admin; can manage team in Settings */
  const isShopOwner = isShopAdmin;
  const isPartsManager = !isPlatformAdmin && profile?.role === ROLES.PARTS_MANAGER;
  /** Can open parts request inbox */
  const canManageParts =
    isPlatformAdmin || isShopAdmin || isPartsManager;
  /** Invite / remove staff / set tech & parts roles */
  const canManageTeam = isShopOwner;

  const value = useMemo(
    () => ({
      ready,
      loading,
      firebaseOk,
      user,
      profile,
      company,
      error,
      setError,
      isPlatformAdmin,
      isShopAdmin,
      isShopOwner,
      isPartsManager,
      canManageParts,
      canManageTeam,
      connectFirebase,
      login,
      signup,
      logout,
      resetPassword,
      setJobFilter,
      reloadConfig: () => setFirebaseOk(isFirebaseReady() || Boolean(loadFirebaseConfig())),
    }),
    [
      ready,
      loading,
      firebaseOk,
      user,
      profile,
      company,
      error,
      isPlatformAdmin,
      isShopAdmin,
      isShopOwner,
      isPartsManager,
      canManageParts,
      canManageTeam,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
