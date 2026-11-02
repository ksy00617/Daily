import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'firebase/auth';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

/* ───────────── 상수 ───────────── */

const WD = ['일', '월', '화', '수', '목', '금', '토'];

const COLORS = [
  { key: 'red', name: '빨강' },
  { key: 'black', name: '검정' },
  { key: 'blue', name: '파랑' },
  { key: 'green', name: '초록' },
  { key: 'orange', name: '주황' },
  { key: 'purple', name: '보라' },
  { key: 'pink', name: '핑크' }
];

const FONT_GROUPS = [
  {
    title: '고딕 · 깔끔한',
    items: [
      { key: 'default', name: '기본 (Inter)' },
      { key: 'sans', name: '노토 산스' },
      { key: 'nanum', name: '나눔고딕' },
      { key: 'gothica1', name: '고딕 A1' },
      { key: 'plex', name: 'IBM 플렉스 산스' }
    ]
  },
  {
    title: '명조 · 차분한',
    items: [
      { key: 'serif', name: '노토 세리프' },
      { key: 'nanummj', name: '나눔명조' },
      { key: 'batang', name: '고운바탕' },
      { key: 'hahmlet', name: '함렛' }
    ]
  }
];
const FONTS = FONT_GROUPS.flatMap((g) => g.items);

const SIZES = [
  { key: 'xs', label: '아주 작게' },
  { key: 's', label: '작게' },
  { key: 'm', label: '보통' }
];

const DEFAULT_SETTINGS = { dark: false, todoColor: 'red', planColor: 'black', font: 'default', size: 'm' };
const SETTINGS_KEY = 'planner_settings_v2';

/* ───────────── 날짜 도우미 ───────────── */

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const todayKey = () => keyOf(new Date());
const monthDay = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
const fullKorean = (k) => {
  const d = parseKey(k);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
};

const blankDay = (k) => ({ date: fullKorean(k), dateKey: k, emoji: '📅', todos: [], timeBlocks: [], notes: '' });

// 예전 버전이 만들어 둔 빈 시간 칸(시간·내용 모두 비어 있음)은 숨긴다
const visibleSlots = (day) => (day?.timeBlocks || []).filter((b) => (b.time || '').trim() || (b.activity || '').trim());

const sortSlots = (list) =>
  [...list].sort((a, b) => {
    const at = (a.time || '').trim();
    const bt = (b.time || '').trim();
    if (!at) return bt ? 1 : 0;
    if (!bt) return -1;
    return at.localeCompare(bt);
  });

const hasRecord = (d) =>
  !!d &&
  ((d.todos || []).some((t) => (t.text || '').trim()) ||
    visibleSlots(d).length > 0 ||
    (d.notes || '').trim().length > 0);

const daysKey = (u) => `planner_days_${u}`;
const unsavedKey = (u) => `planner_unsaved_${u}`;
const readJSON = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
};
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* noop */ } };
const saveErrorText = (e) => (e && e.code === 'permission-denied'
  ? '클라우드 저장 권한이 막혀 있어요. 이 기기에는 저장해 두었어요.'
  : '저장에 실패했어요. 이 기기에 저장해 두고, 연결되면 다시 올릴게요.');

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const loadLocalSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw));
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
};

const sanitizeSettings = (s) => {
  const out = { ...DEFAULT_SETTINGS };
  if (!s || typeof s !== 'object') return out;
  if (typeof s.dark === 'boolean') out.dark = s.dark;
  if (COLORS.some((c) => c.key === s.todoColor)) out.todoColor = s.todoColor;
  if (COLORS.some((c) => c.key === s.planColor)) out.planColor = s.planColor;
  if (FONTS.some((f) => f.key === s.font)) out.font = s.font;
  if (SIZES.some((z) => z.key === s.size)) out.size = s.size;
  return out;
};

/* ───────────── 아이콘 ───────────── */

const Icon = {
  Check: (p) => (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true" {...p}>
      <path d="M2.5 6.2 5 8.6 9.5 3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Plus: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M7 2v10M2 7h10" />
    </svg>
  ),
  Up: () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10l4-4 4 4" />
    </svg>
  ),
  Down: () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  ),
  Trash: () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8.2" />
    </svg>
  ),
  Prev: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 3.5 5.5 8l4.5 4.5" />
    </svg>
  ),
  Next: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  ),
  Close: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  ),
  Settings: () => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M3 6h8M15 6h2M3 14h2M9 14h8" />
      <circle cx="13" cy="6" r="2" />
      <circle cx="7" cy="14" r="2" />
    </svg>
  ),
  Sun: () => (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="4" />
      <path d="M11 2v2M11 18v2M2 11h2M18 11h2M4.6 4.6l1.4 1.4M16 16l1.4 1.4M4.6 17.4 6 16M16 6l1.4-1.4" />
    </svg>
  ),
  Moon: () => (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13.4A7.5 7.5 0 0 1 8.6 4a7.5 7.5 0 1 0 9.4 9.4Z" />
    </svg>
  ),
  Logout: () => (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h3" />
      <path d="M12.5 6.5 16 10l-3.5 3.5M16 10H8" />
    </svg>
  ),
  Chevron: ({ open }) => (
    <svg className={open ? 'chev open' : 'chev'} width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 8l5 5 5-5" />
    </svg>
  ),
  CalendarSmall: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="2" y="3" width="12" height="11" rx="2.5" />
      <path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" strokeLinecap="round" />
    </svg>
  ),
  TodoSmall: () => (
    <svg className="ic-todo" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="3.5" />
      <path d="M5.2 8.2 7.1 10l3.7-4" />
    </svg>
  ),
  ClockSmall: () => (
    <svg className="ic-plan" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8V8l2.2 1.4" />
    </svg>
  ),
  TodoHead: () => (
    <svg className="ic-todo" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4.5 4 6l2.5-2.5M2.5 11.5 4 13l2.5-2.5M9 5h6.5M9 12h6.5" />
    </svg>
  ),
  ClockHead: () => (
    <svg className="ic-plan" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" />
      <path d="M9 5.5V9l2.5 1.5" />
    </svg>
  ),
  Memo: () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 2.5h7l3 3v10H4z" />
      <path d="M6.5 8.5h5M6.5 11.5h3.5" />
    </svg>
  ),
  Pen: () => (
    <svg className="callout-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.5 2.8a1.8 1.8 0 0 1 2.6 2.6L6.5 14 3 15l1-3.5z" />
    </svg>
  ),
  Google: () => (
    <svg className="g-logo" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </svg>
  )
};

/* 진행률 미니 링 */
const MiniRing = ({ pct, kind }) => {
  const c = 2 * Math.PI * 7;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" strokeWidth="3.2" className={kind === 'todo' ? 'ta' : 'tb'} />
      <circle
        cx="10" cy="10" r="7" fill="none" strokeWidth="3.2"
        className={kind === 'todo' ? 'ra' : 'rb'}
        strokeDasharray={`${((c * pct) / 100).toFixed(2)} ${c.toFixed(2)}`}
        strokeLinecap={pct > 0 ? 'round' : 'butt'}
        transform="rotate(-90 10 10)"
      />
    </svg>
  );
};

/* 입력 중에도 커서가 튀지 않도록, 포커스가 있는 동안은 바깥 값으로 덮어쓰지 않는 입력칸 */
function SyncedInput({ value, onCommit, as = 'input', ...rest }) {
  const [local, setLocal] = useState(value || '');
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value || '');
  }, [value]);
  const Tag = as;
  return (
    <Tag
      {...rest}
      value={local}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; onCommit(local); }}
      onChange={(e) => { setLocal(e.target.value); onCommit(e.target.value); }}
    />
  );
}

/* ───────────── 로그인 화면 ───────────── */

function LoginScreen({ onLogin, busy, settingsClass }) {
  const now = new Date();
  return (
    <div className={`login ${settingsClass}`}>
      <div className="login-icon" aria-hidden="true">
        <span className="li-bar">{WD[now.getDay()]}요일</span>
        <span className="li-num">{now.getDate()}</span>
      </div>
      <h1 className="login-title">Planner</h1>
      <p className="login-sub">로그인하고 나만의 플래너를 시작하세요. 모든 일정은 기기 간 실시간으로 동기화됩니다.</p>
      <button className="g-btn" onClick={onLogin} disabled={busy}>
        <Icon.Google />
        {busy ? '로그인 중…' : 'Google 계정으로 계속하기'}
      </button>
      <p className="login-fine">Daily Planner · 실시간 동기화</p>
    </div>
  );
}

/* ───────────── 메인 앱 ───────────── */

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = 확인 중, null = 로그아웃
  const [loginBusy, setLoginBusy] = useState(false);
  const [days, setDays] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [sel, setSel] = useState(todayKey());
  const [today, setToday] = useState(todayKey());
  const [settings, setSettings] = useState(loadLocalSettings);
  const [calOpen, setCalOpen] = useState(false);
  const [view, setView] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const [draftAct, setDraftAct] = useState('');
  const [toast, setToast] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [pending, setPending] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  const toastTimer = useRef(null);
  const dirty = useRef({}); // 아직 서버에 올라가지 않은 날짜 → 버전
  const saveTimers = useRef({});
  const daysRef = useRef(days);
  daysRef.current = days;
  const settingsFromCloud = useRef(false);
  const settingsTimer = useRef(null);
  const calRef = useRef(null);

  const showToast = useCallback((m) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  /* ── 로그인 상태 ── */
  useEffect(() => {
    getRedirectResult(auth).catch((e) => console.warn('redirect result', e));
    return onAuthStateChanged(auth, (u) => setUser(u || null));
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setLoginBusy(true);
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      if (['auth/popup-blocked', 'auth/cancelled-popup-request', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (err) {
          showToast('로그인에 실패했어요. 잠시 후 다시 시도해 주세요.');
        }
      } else if (e.code !== 'auth/popup-closed-by-user') {
        console.error(e);
        showToast(e.code === 'auth/unauthorized-domain'
          ? '이 주소는 아직 로그인이 허용되지 않았어요. Firebase 승인 도메인을 확인해 주세요.'
          : '로그인에 실패했어요. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setLoginBusy(false);
    }
  };

  const logout = async () => {
    Object.values(saveTimers.current).forEach(clearTimeout);
    saveTimers.current = {};
    dirty.current = {};
    setDays({});
    setLoaded(false);
    try { localStorage.removeItem('notion_planner_active_date'); } catch (e) { /* noop */ }
    await signOut(auth);
    showToast('로그아웃되었습니다.');
  };

  /* ── 일정 실시간 동기화 ── */
  useEffect(() => {
    if (!user) return undefined;
    setLoaded(false);

    // 1) 이 기기에 저장해 둔 기록을 먼저 보여 줌 (클라우드가 안 돼도 사라지지 않게)
    let local = readJSON(daysKey(user.uid), null);
    let unsaved = readJSON(unsavedKey(user.uid), []);
    if (!local) {
      // 예전 노션 스타일 버전이 이 브라우저에 남겨 둔 기록이 있으면 가져와서 클라우드에 올림
      const legacy = readJSON('notion_planner_stable_backup', null);
      if (legacy && typeof legacy === 'object' && Object.keys(legacy).length) {
        local = legacy;
        unsaved = Object.keys(legacy);
        writeJSON(daysKey(user.uid), local);
        writeJSON(unsavedKey(user.uid), unsaved);
      }
    }
    if (local) setDays(local);
    unsaved.forEach((k) => { dirty.current[k] = (dirty.current[k] || 0) + 1; });
    setPending(Object.keys(dirty.current).length);

    const ref = collection(db, 'users', user.uid, 'days');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const remote = {};
        snap.forEach((d) => { remote[d.id] = d.data(); });
        setDays((prev) => {
          const next = { ...remote };
          // 아직 저장 중인 내 수정은 서버 값으로 덮어쓰지 않음
          Object.keys(dirty.current).forEach((k) => { if (prev[k]) next[k] = prev[k]; });
          return next;
        });
        setLoaded(true);
      },
      (err) => {
        console.error('sync error', err);
        showToast(err && err.code === 'permission-denied'
          ? '클라우드에서 일정을 불러올 권한이 막혀 있어요. 이 기기에 저장된 기록을 보여 드려요.'
          : '동기화에 문제가 생겼어요. 이 기기에 저장된 기록을 보여 드려요.');
        setLoaded(true);
      }
    );
    return unsub;
  }, [user, showToast]);

  /* ── 설정 동기화 (기기 간 같은 테마) ── */
  useEffect(() => {
    if (!user) return undefined;
    const ref = doc(db, 'users', user.uid, 'meta', 'settings');
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists() && !snap.metadata.hasPendingWrites) {
          settingsFromCloud.current = true;
          setSettings(sanitizeSettings(snap.data()));
        }
      },
      () => { /* 설정 문서를 못 읽어도 이 기기 설정으로 계속 사용 */ }
    );
  }, [user]);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* noop */ }
    if (settingsFromCloud.current) {
      settingsFromCloud.current = false;
      return;
    }
    if (!user) return;
    clearTimeout(settingsTimer.current);
    settingsTimer.current = setTimeout(() => {
      setDoc(doc(db, 'users', user.uid, 'meta', 'settings'), settings).catch(() => { /* 무시 */ });
    }, 500);
  }, [settings, user]);

  /* ── 화면 모드: 브라우저 배경과 상태바 색 ── */
  useEffect(() => {
    const bg = settings.dark ? '#191919' : '#FBFBFA';
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', bg);
  }, [settings.dark]);

  /* ── 온라인 상태 ── */
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  /* ── 자정이 지나면 오늘로 ── */
  useEffect(() => {
    const t = setInterval(() => {
      const k = todayKey();
      setToday((prev) => {
        if (prev !== k) {
          setSel((s) => (s === prev ? k : s));
          return k;
        }
        return prev;
      });
    }, 30000);
    const vis = () => {
      if (document.visibilityState === 'visible') {
        const k = todayKey();
        setToday((prev) => {
          if (prev !== k) setSel((s) => (s === prev ? k : s));
          return k;
        });
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);

  /* ── 달력 바깥 누르면 닫기 ── */
  useEffect(() => {
    if (!calOpen) return undefined;
    const h = (e) => { if (calRef.current && !calRef.current.contains(e.target)) setCalOpen(false); };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [calOpen]);

  /* ── Esc로 창 닫기 ── */
  useEffect(() => {
    const h = (e) => {
      if (e.key !== 'Escape') return;
      if (confirm) setConfirm(null);
      else if (settingsOpen) setSettingsOpen(false);
      else if (calOpen) setCalOpen(false);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [confirm, settingsOpen, calOpen]);

  /* ── 저장 ── */
  const scheduleSave = useCallback((k) => {
    if (!user) return;
    const version = (dirty.current[k] || 0) + 1;
    dirty.current[k] = version;
    clearTimeout(saveTimers.current[k]);
    setPending(Object.keys(dirty.current).length);
    const list = readJSON(unsavedKey(user.uid), []);
    if (!list.includes(k)) writeJSON(unsavedKey(user.uid), [...list, k]);
    saveTimers.current[k] = setTimeout(async () => {
      const data = daysRef.current[k];
      try {
        if (data) await setDoc(doc(db, 'users', user.uid, 'days', k), data);
        if (dirty.current[k] === version) {
          delete dirty.current[k];
          writeJSON(unsavedKey(user.uid), readJSON(unsavedKey(user.uid), []).filter((x) => x !== k));
        }
        setSaveError(false);
      } catch (e) {
        // 실패한 기록은 이 기기에 남겨 두고 다음에 다시 올림
        console.error('save failed', e);
        setSaveError(true);
        showToast(saveErrorText(e));
      } finally {
        setPending(Object.keys(dirty.current).length);
      }
    }, 600);
  }, [user, showToast]);

  /* 이 기기에 기록을 계속 저장해 둠 */
  useEffect(() => {
    if (user && loaded) writeJSON(daysKey(user.uid), days);
  }, [days, user, loaded]);

  /* 못 올린 기록은 불러온 직후·다시 연결됐을 때 다시 올림 */
  const retryUnsaved = useCallback(() => {
    if (!user) return;
    readJSON(unsavedKey(user.uid), []).forEach((k) => { if (daysRef.current[k]) scheduleSave(k); });
  }, [user, scheduleSave]);
  useEffect(() => { if (loaded) retryUnsaved(); }, [loaded, retryUnsaved]);
  useEffect(() => {
    window.addEventListener('online', retryUnsaved);
    return () => window.removeEventListener('online', retryUnsaved);
  }, [retryUnsaved]);

  const updateDay = useCallback((k, fn) => {
    setDays((prev) => {
      const base = prev[k] ? JSON.parse(JSON.stringify(prev[k])) : blankDay(k);
      const nextDay = fn(base) || base;
      return { ...prev, [k]: nextDay };
    });
    scheduleSave(k);
  }, [scheduleSave]);

  const day = days[sel] || blankDay(sel);
  const todos = day.todos || [];
  const slots = visibleSlots(day);

  const editToday = (fn) => updateDay(sel, fn);

  /* 체크리스트 */
  const addTodo = () => {
    const t = draft.trim();
    if (!t) return;
    editToday((d) => { d.todos = [...(d.todos || []), { id: uid(), text: t, completed: false }]; });
    setDraft('');
    showToast('체크리스트가 추가되었습니다.');
  };
  const toggleTodo = (id) => editToday((d) => { d.todos = d.todos.map((x) => (x.id === id ? { ...x, completed: !x.completed } : x)); });
  const editTodo = (id, text) => editToday((d) => { d.todos = d.todos.map((x) => (x.id === id ? { ...x, text } : x)); });
  const removeTodo = (id) => {
    editToday((d) => { d.todos = d.todos.filter((x) => x.id !== id); });
    showToast('체크리스트에서 삭제되었습니다.');
  };
  const moveTodo = (i, dir) => editToday((d) => {
    const a = d.todos;
    const j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
  });

  /* 시간대별 일정표 */
  const addSlot = () => {
    const a = draftAct.trim();
    if (!a) return;
    const t = draftTime.trim();
    editToday((d) => { d.timeBlocks = sortSlots([...visibleSlots(d), { id: uid(), time: t, activity: a, completed: false }]); });
    setDraftTime('');
    setDraftAct('');
    showToast('시간 계획이 추가되었습니다.');
  };
  const toggleSlot = (id) => editToday((d) => { d.timeBlocks = visibleSlots(d).map((x) => (x.id === id ? { ...x, completed: !x.completed } : x)); });
  const editSlot = (id, patch) => editToday((d) => { d.timeBlocks = visibleSlots(d).map((x) => (x.id === id ? { ...x, ...patch } : x)); });
  const sortSlotsNow = () => editToday((d) => { d.timeBlocks = sortSlots(visibleSlots(d)); });
  const removeSlot = (id) => {
    editToday((d) => { d.timeBlocks = visibleSlots(d).filter((x) => x.id !== id); });
    showToast('시간표 칸이 삭제되었습니다.');
  };

  /* 메모 */
  const editNotes = (v) => editToday((d) => { d.notes = v; });

  /* 날짜 이동 */
  const pickDate = (k) => {
    setSel(k);
    setCalOpen(false);
    setDraft(''); setDraftTime(''); setDraftAct('');
    showToast(k === today ? '오늘 일정으로 이동했습니다.' : `${monthDay(parseKey(k))} 일정으로 이동했습니다.`);
  };
  const goToday = () => {
    const d = new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
    pickDate(today);
  };
  const toggleCal = () => {
    if (!calOpen) {
      const d = parseKey(sel);
      setView({ y: d.getFullYear(), m: d.getMonth() });
    }
    setCalOpen(!calOpen);
  };
  const shiftMonth = (n) => setView((v) => {
    let m = v.m + n;
    let y = v.y;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    return { y, m };
  });

  const resetAll = async () => {
    setConfirm(null);
    const keys = Object.keys(daysRef.current);
    Object.values(saveTimers.current).forEach(clearTimeout);
    saveTimers.current = {};
    dirty.current = {};
    setDays({});
    setSel(today);
    try {
      await Promise.all(keys.map((k) => deleteDoc(doc(db, 'users', user.uid, 'days', k))));
      showToast('전체 일정 데이터가 초기화되었습니다.');
    } catch (e) {
      showToast('일부 기록을 지우지 못했어요. 다시 시도해 주세요.');
    }
  };

  /* 계산 값 */
  const doneT = todos.filter((x) => x.completed).length;
  const doneS = slots.filter((x) => x.completed).length;
  const pT = todos.length ? Math.round((doneT / todos.length) * 100) : 0;
  const pS = slots.length ? Math.round((doneS / slots.length) * 100) : 0;
  const sd = parseKey(sel);

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const start = first.getDay();
    const dim = new Date(view.y, view.m + 1, 0).getDate();
    const total = Math.ceil((start + dim) / 7) * 7;
    const out = [];
    for (let i = 0; i < total; i++) {
      const dt = new Date(view.y, view.m, 1 - start + i);
      const k = keyOf(dt);
      out.push({
        k,
        label: dt.getDate(),
        cls: ['day', dt.getMonth() === view.m ? '' : 'out', k === today ? 'today' : '', k === sel ? 'sel' : ''].join(' '),
        mark: hasRecord(days[k])
      });
    }
    return out;
  }, [view, days, sel, today]);

  const rangeLabel = useMemo(() => {
    const ks = Object.keys(days).filter((k) => hasRecord(days[k])).sort();
    if (!ks.length) return '아직 저장된 기록이 없습니다.';
    return `기록 기간: ${ks[0].replace(/-/g, '.')} – ${ks[ks.length - 1].replace(/-/g, '.')}`;
  }, [days]);

  const themeClass = [
    settings.dark ? 'dark' : '',
    `todo-${settings.todoColor}`,
    `plan-${settings.planColor}`,
    `f-${settings.font}`,
    `s-${settings.size}`
  ].join(' ');

  const setS = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const enterKey = (fn) => (e) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      fn();
    }
  };

  /* ── 화면 ── */

  if (user === undefined || (user && !loaded)) {
    return (
      <div className={`app ${themeClass} loading-screen`}>
        <div className="spinner" aria-label="불러오는 중" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginScreen onLogin={login} busy={loginBusy} settingsClass={themeClass} />
        {toast && <div className={`toast-wrap ${themeClass}`}><div className="toast" role="status">{toast}</div></div>}
      </>
    );
  }

  const syncText = !online ? '오프라인 · 이 기기에 저장됨' : saveError ? '이 기기에만 저장됨' : pending > 0 ? '저장 중…' : '저장됨';
  const syncCls = !online ? 'dot off' : saveError ? 'dot err' : pending > 0 ? 'dot busy' : 'dot';

  return (
    <div className={`app ${themeClass}`}>
      <header className="top">
        <div className="top-in">
          <nav className="crumbs" aria-label="현재 위치">
            <span className="crumb-icon" aria-hidden="true"><span className="ci-bar" /><span className="ci-num">{new Date().getDate()}</span></span>
            <span>Planner</span>
            <span className="sep">/</span>
            <span className="cur">{`${sd.getFullYear()}년 ${sd.getMonth() + 1}월`}</span>
          </nav>
          <div className="top-actions">
            <span className="sync"><span className={syncCls} />{syncText}</span>
            <button className="icon-btn" aria-label="설정" title="설정" onClick={() => { setSettingsOpen(true); setCalOpen(false); }}><Icon.Settings /></button>
            <button className="icon-btn" aria-label={settings.dark ? '라이트 모드' : '다크 모드'} title={settings.dark ? '라이트 모드' : '다크 모드'} onClick={() => setS({ dark: !settings.dark })}>
              {settings.dark ? <Icon.Sun /> : <Icon.Moon />}
            </button>
            <button className="logout-btn" onClick={logout}><Icon.Logout /><span>로그아웃</span></button>
          </div>
        </div>
      </header>

      <main className="page">
        <div className="page-icon" aria-hidden="true">
          <span className="pi-bar">{WD[sd.getDay()]}요일</span>
          <span className="pi-num">{sd.getDate()}</span>
        </div>
        <h1 className="page-title">{monthDay(sd)} <span className="title-dow">{WD[sd.getDay()]}요일</span></h1>

        <div className="props">
          <div className="prop">
            <span className="prop-key"><Icon.CalendarSmall />날짜</span>
            <div className="prop-val" ref={calRef}>
              <button className="chip-btn" aria-expanded={calOpen} onClick={toggleCal}>
                {`${sd.getFullYear()}년 ${sd.getMonth() + 1}월 ${sd.getDate()}일`}<Icon.Chevron open={calOpen} />
              </button>
              {sel !== today && (
                <>
                  <span className="pill">기록 편집 중</span>
                  <button className="text-btn" onClick={goToday}>오늘로 가기</button>
                </>
              )}
              {calOpen && (
                <div className="popover" role="dialog" aria-label="날짜 선택">
                  <div className="pop-head">
                    <span className="pop-title">{`${view.y}년 ${view.m + 1}월`}</span>
                    <div className="pop-nav">
                      <button className="mini" aria-label="이전 달" onClick={() => shiftMonth(-1)}><Icon.Prev /></button>
                      <button className="mini" aria-label="다음 달" onClick={() => shiftMonth(1)}><Icon.Next /></button>
                    </div>
                  </div>
                  <div className="dow">{WD.map((w) => <span key={w}>{w}</span>)}</div>
                  <div className="days">
                    {cells.map((c) => (
                      <button key={c.k} className={c.cls} aria-label={monthDay(parseKey(c.k))} onClick={() => pickDate(c.k)}>
                        <span>{c.label}</span>
                        <span className={c.mark ? 'mark on' : 'mark'} />
                      </button>
                    ))}
                  </div>
                  <div className="pop-foot">
                    <button className="text-btn" onClick={goToday}>오늘</button>
                    <button
                      className="text-btn danger"
                      onClick={() => { setCalOpen(false); setConfirm({ title: '기록 전체 비우기', msg: '저장된 모든 일정이 모든 기기에서 지워집니다. 되돌릴 수 없어요.', ok: '모두 지우기', run: resetAll }); }}
                    >
                      기록 전체 비우기
                    </button>
                  </div>
                  <p className="pop-note">{rangeLabel}</p>
                </div>
              )}
            </div>
          </div>
          <div className="prop">
            <span className="prop-key"><Icon.TodoSmall />TO-DO</span>
            <div className="prop-val">
              <MiniRing pct={pT} kind="todo" />
              <span className="pct">{pT}%</span>
              <span className="muted">{`${doneT} / ${todos.length} 완료`}</span>
            </div>
          </div>
          <div className="prop">
            <span className="prop-key"><Icon.ClockSmall />일정표</span>
            <div className="prop-val">
              <MiniRing pct={pS} kind="plan" />
              <span className="pct">{pS}%</span>
              <span className="muted">{`${doneS} / ${slots.length} 완료`}</span>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className="cols">
          <section className="col" aria-labelledby="todo-h">
            <div className="block-head">
              <Icon.TodoHead />
              <h2 id="todo-h" className="block-title">오늘의 체크리스트</h2>
              <span className="count">{todos.length}</span>
            </div>
            <div className="group">
              <ul className="list">
                {todos.map((t, i) => (
                  <li className="row" key={t.id}>
                    <button className={t.completed ? 'check on' : 'check'} aria-label={t.completed ? '완료 취소' : '완료로 표시'} aria-pressed={t.completed} onClick={() => toggleTodo(t.id)}>
                      <span className="box"><Icon.Check /></span>
                    </button>
                    <SyncedInput
                      className={t.completed ? 'row-input done' : 'row-input'}
                      value={t.text}
                      placeholder="할 일을 입력하세요"
                      aria-label="할 일 내용"
                      onCommit={(v) => { if (v !== t.text) editTodo(t.id, v); }}
                    />
                    <div className="row-tools">
                      <button className="mini" aria-label="위로 이동" disabled={i === 0} onClick={() => moveTodo(i, -1)}><Icon.Up /></button>
                      <button className="mini" aria-label="아래로 이동" disabled={i === todos.length - 1} onClick={() => moveTodo(i, 1)}><Icon.Down /></button>
                      <button className="mini danger" aria-label="삭제" onClick={() => removeTodo(t.id)}><Icon.Trash /></button>
                    </div>
                  </li>
                ))}
              </ul>
              {todos.length === 0 && <p className="empty">오늘의 체크리스트를 추가해보세요.</p>}
              <div className="add-row">
                <span className="plus-slot" aria-hidden="true"><Icon.Plus /></span>
                <label className="sr" htmlFor="new-todo">할 일 추가</label>
                <input id="new-todo" className="add-input" placeholder="할 일 추가…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={enterKey(addTodo)} enterKeyHint="done" />
                <button className="pill-btn" disabled={!draft.trim()} onClick={addTodo}>추가</button>
              </div>
            </div>
          </section>

          <section className="col" aria-labelledby="slot-h">
            <div className="block-head">
              <Icon.ClockHead />
              <h2 id="slot-h" className="block-title">시간대별 일정표</h2>
              <span className="count">{slots.length}</span>
            </div>
            <div className="group plan-list">
              <ul className="list">
                {slots.map((s) => (
                  <li className="row" key={s.id}>
                    <button className={s.completed ? 'check on' : 'check'} aria-label={s.completed ? '완료 취소' : '완료로 표시'} aria-pressed={s.completed} onClick={() => toggleSlot(s.id)}>
                      <span className="box"><Icon.Check /></span>
                    </button>
                    <SyncedInput
                      className="time-input"
                      value={s.time}
                      placeholder="00:00"
                      aria-label="시간대"
                      inputMode="numeric"
                      onCommit={(v) => { if (v !== s.time) editSlot(s.id, { time: v }); }}
                      onBlurCapture={sortSlotsNow}
                    />
                    <SyncedInput
                      className={s.completed ? 'row-input done' : 'row-input'}
                      value={s.activity}
                      placeholder="일정 내용"
                      aria-label="일정 내용"
                      onCommit={(v) => { if (v !== s.activity) editSlot(s.id, { activity: v }); }}
                    />
                    <div className="row-tools">
                      <button className="mini danger" aria-label="시간표 칸 삭제" onClick={() => removeSlot(s.id)}><Icon.Trash /></button>
                    </div>
                  </li>
                ))}
              </ul>
              {slots.length === 0 && <p className="empty">시간대별 일정표를 추가해보세요.</p>}
              <div className="add-row">
                <span className="plus-slot" aria-hidden="true"><Icon.Plus /></span>
                <label className="sr" htmlFor="new-slot-time">시간</label>
                <input id="new-slot-time" className="time-input" placeholder="00:00" inputMode="numeric" value={draftTime} onChange={(e) => setDraftTime(e.target.value)} onKeyDown={enterKey(addSlot)} />
                <label className="sr" htmlFor="new-slot-act">일정 내용</label>
                <input id="new-slot-act" className="add-input" placeholder="시간 계획 추가…" value={draftAct} onChange={(e) => setDraftAct(e.target.value)} onKeyDown={enterKey(addSlot)} enterKeyHint="done" />
                <button className="pill-btn" disabled={!draftAct.trim()} onClick={addSlot}>추가</button>
              </div>
            </div>
          </section>
        </div>

        <section className="memo-block" aria-labelledby="memo-h">
          <div className="block-head">
            <Icon.Memo />
            <h2 id="memo-h" className="block-title">오늘의 자유 메모</h2>
            <span className="count">{day.notes ? `${day.notes.length}자` : ''}</span>
          </div>
          <div className="callout">
            <Icon.Pen />
            <label className="sr" htmlFor="memo-input">오늘의 자유 메모</label>
            <SyncedInput
              as="textarea"
              id="memo-input"
              className="memo"
              placeholder="자유롭게 기록해 보세요. 작성하는 즉시 자동 저장됩니다."
              value={day.notes}
              onCommit={(v) => { if (v !== (day.notes || '')) editNotes(v); }}
            />
          </div>
        </section>
      </main>

      {settingsOpen && (
        <div className="scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="set-h">
            <div className="sheet-head">
              <h2 id="set-h" className="sheet-title">설정</h2>
              <button className="icon-btn" aria-label="설정 닫기" onClick={() => setSettingsOpen(false)}><Icon.Close /></button>
            </div>
            <div className="sheet-body">
              <div className="set-sec">
                <p className="set-label">화면 모드</p>
                <div className="seg seg-2">
                  <button className={settings.dark ? '' : 'on'} aria-pressed={!settings.dark} onClick={() => setS({ dark: false })}>라이트</button>
                  <button className={settings.dark ? 'on' : ''} aria-pressed={settings.dark} onClick={() => setS({ dark: true })}>다크</button>
                </div>
              </div>

              <div className="set-sec">
                <p className="set-label">
                  <span>테마 색상</span>
                  <button className="preset-btn" onClick={() => setS({ todoColor: DEFAULT_SETTINGS.todoColor, planColor: DEFAULT_SETTINGS.planColor })}>
                    <span className="pd r" /><span className="pd k" />기본
                  </button>
                </p>
                <div className="color-row"><span className="color-name"><span className="tag todo" />체크리스트 · TO-DO</span><span className="set-val">{COLORS.find((c) => c.key === settings.todoColor)?.name}</span></div>
                <div className="swatches">
                  {COLORS.map((c) => (
                    <button key={c.key} className={c.key === settings.todoColor ? 'sw-btn on' : 'sw-btn'} aria-label={`체크리스트 색상 ${c.name}`} aria-pressed={c.key === settings.todoColor} onClick={() => setS({ todoColor: c.key })}>
                      <span className={`sw-dot dot-${c.key}`} />
                    </button>
                  ))}
                </div>
                <div className="color-row second"><span className="color-name"><span className="tag plan" />시간대별 일정표</span><span className="set-val">{COLORS.find((c) => c.key === settings.planColor)?.name}</span></div>
                <div className="swatches">
                  {COLORS.map((c) => (
                    <button key={c.key} className={c.key === settings.planColor ? 'sw-btn on' : 'sw-btn'} aria-label={`일정표 색상 ${c.name}`} aria-pressed={c.key === settings.planColor} onClick={() => setS({ planColor: c.key })}>
                      <span className={`sw-dot dot-${c.key}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="set-sec">
                <p className="set-label">글꼴</p>
                <div className="opts">
                  {FONT_GROUPS.map((g) => (
                    <React.Fragment key={g.title}>
                      <p className="opt-group">{g.title}</p>
                      {g.items.map((f) => {
                        const on = f.key === settings.font;
                        return (
                          <button key={f.key} className={on ? 'opt on' : 'opt'} aria-pressed={on} onClick={() => setS({ font: f.key })}>
                            <span className={`opt-name pv f-${f.key}`}>{f.name}</span>
                            <span className={`opt-sample pv f-${f.key}`}>오늘의 계획 Aa 123</span>
                            <svg className={on ? 'opt-check on' : 'opt-check'} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 5" /></svg>
                          </button>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="set-sec last">
                <p className="set-label"><span>글자 크기</span><span className="set-val">{SIZES.find((z) => z.key === settings.size)?.label}</span></p>
                <div className="seg seg-3">
                  {SIZES.map((z) => (
                    <button key={z.key} className={z.key === settings.size ? 'on' : ''} aria-pressed={z.key === settings.size} onClick={() => setS({ size: z.key })}>{z.label}</button>
                  ))}
                </div>
                <p className="size-preview">오늘의 계획을 이 크기로 볼 수 있어요.</p>
              </div>
            </div>
            <div className="sheet-foot">
              <button className="text-btn" onClick={() => { setSettings({ ...DEFAULT_SETTINGS }); showToast('기본 설정으로 되돌렸습니다.'); }}>기본값으로</button>
              <button className="pill-btn" onClick={() => setSettingsOpen(false)}>완료</button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="scrim">
          <div className="alert" role="alertdialog" aria-labelledby="al-t" aria-describedby="al-m">
            <h3 id="al-t" className="alert-title">{confirm.title}</h3>
            <p id="al-m" className="alert-msg">{confirm.msg}</p>
            <div className="alert-btns">
              <button onClick={() => setConfirm(null)}>취소</button>
              <button className="destructive" onClick={confirm.run}>{confirm.ok}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
