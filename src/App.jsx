import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import FirebaseSetup from './pages/FirebaseSetup';
import Login from './pages/Login';
import JoinShop from './pages/JoinShop';
import MasterControl from './pages/MasterControl';
import Dashboard from './pages/Dashboard';
import JobDetail from './pages/JobDetail';
import ShopAccount from './pages/ShopAccount';
import PartsInbox from './pages/PartsInbox';
import { APP_NAME } from './config';
import { ROLES } from './lib/constants';

export default function App() {
  const { ready, loading, firebaseOk, user, profile, company, isPlatformAdmin, isPartsManager } =
    useAuth();
  /** Parts managers land on parts inbox; others on job list */
  const defaultView =
    !isPlatformAdmin && profile?.role === ROLES.PARTS_MANAGER ? 'parts' : 'dashboard';
  const [view, setView] = useState(defaultView); // dashboard | detail | account | parts
  const [currentJob, setCurrentJob] = useState(null);
  const [homeReady, setHomeReady] = useState(false);

  // After profile loads, send pure parts managers to parts home once
  useEffect(() => {
    if (!ready || loading || !profile || isPlatformAdmin || homeReady) return;
    if (profile.role === ROLES.PARTS_MANAGER) {
      setView('parts');
    }
    setHomeReady(true);
  }, [ready, loading, profile, isPlatformAdmin, homeReady]);

  if (!firebaseOk) {
    return <FirebaseSetup />;
  }

  if (!ready || loading) {
    return (
      <div className="app-shell flex flex-col items-center justify-center gap-4">
        <RefreshCw className="h-10 w-10 text-blue-500 animate-spin" />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Loading {APP_NAME}…
        </p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // Platform owner → Master Control only
  if (isPlatformAdmin) {
    return <MasterControl />;
  }

  // Shop user without a company yet
  if (!profile?.companyId || !company) {
    return <JoinShop />;
  }

  if (company.active === false) {
    return (
      <div className="app-shell flex items-center justify-center p-6">
        <div className="app-card p-8 max-w-md text-center">
          <h1 className="text-xl font-black mb-2">Shop inactive</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This shop has been deactivated. Contact your platform administrator.
          </p>
        </div>
      </div>
    );
  }

  const goJobsHome = () => {
    setCurrentJob(null);
    setView('dashboard');
  };

  if (view === 'detail' && currentJob) {
    return (
      <JobDetail
        job={currentJob}
        onBack={goJobsHome}
      />
    );
  }

  if (view === 'account') {
    return (
      <ShopAccount
        onBack={() =>
          setView(profile?.role === ROLES.PARTS_MANAGER ? 'parts' : 'dashboard')
        }
      />
    );
  }

  if (view === 'parts') {
    return (
      <PartsInbox
        onBack={goJobsHome}
        onOpenJobs={goJobsHome}
        onOpenJob={(job) => {
          if (job && typeof job === 'object' && job.id) {
            setCurrentJob(job);
            setView('detail');
          } else {
            goJobsHome();
          }
        }}
        isPartsHome={isPartsManager || profile?.role === ROLES.PARTS_MANAGER}
        onOpenSettings={() => setView('account')}
      />
    );
  }

  return (
    <Dashboard
      onOpenJob={(job) => {
        setCurrentJob(job);
        setView('detail');
      }}
      onOpenSettings={() => setView('account')}
      onOpenParts={() => setView('parts')}
    />
  );
}
