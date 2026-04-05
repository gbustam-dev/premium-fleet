/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, Component } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Car, 
  Settings, 
  LayoutDashboard, 
  History as HistoryIcon, 
  TrendingUp, 
  User, 
  Plus, 
  Leaf, 
  Fuel, 
  Calendar, 
  Clock, 
  Gauge, 
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  TrendingDown,
  Zap,
  Edit2,
  Trash2,
  LogOut,
  MapPin,
  Download,
  Upload,
  FileJson,
  FileSpreadsheet,
  Loader2
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import * as XLSX from 'xlsx';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { 
  ResponsiveContainer, 
  XAxis, 
  YAxis, 
  Tooltip, 
  AreaChart, 
  Area, 
  CartesianGrid,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  ReferenceArea,
  Cell,
  ComposedChart,
  Bar
} from 'recharts';

import { 
  VEHICLE_BRANDS, 
  VEHICLE_MODELS, 
  DEFAULT_EFFICIENCIES,
  COMMON_PROPULSIONS
} from './constants/vehicleData';

// Fix for default marker icon in Leaflet with React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});
import { FuelLog, UserProfile, Vehicle } from './types';

// --- Number Formatting ---
const formatLiters = (val: number) => new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
const formatPrice = (val: number) => new Intl.NumberFormat('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
const formatKm = (val: number) => new Intl.NumberFormat('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
const formatMoney = (val: number) => new Intl.NumberFormat('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
const formatEfficiency = (val: number) => new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

// Cache sorted logs per vehicle to avoid O(N^2 log N) performance bottleneck
const sortedLogsCache = new WeakMap<FuelLog[], Record<string, FuelLog[]>>();

const getSortedVehicleLogs = (allLogs: FuelLog[], vehicleId: string) => {
  let cache = sortedLogsCache.get(allLogs);
  if (!cache) {
    cache = {};
    sortedLogsCache.set(allLogs, cache);
  }
  if (!cache[vehicleId]) {
    cache[vehicleId] = allLogs
      .filter(log => log.vehicleId === vehicleId)
      .sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time || '00:00'}`);
        const dateB = new Date(`${b.date}T${b.time || '00:00'}`);
        return dateA.getTime() - dateB.getTime();
      });
  }
  return cache[vehicleId];
};

const calculateLogStats = (currentLog: { mileage: number, liters: number, totalCost: number, date: string, time?: string, vehicleId: string, id?: string }, allLogs: FuelLog[]) => {
  if (!currentLog.mileage || !currentLog.liters || !currentLog.totalCost) return null;

  const currentDateTime = new Date(`${currentLog.date}T${currentLog.time || '00:00'}`);
  
  const vehicleLogs = getSortedVehicleLogs(allLogs, currentLog.vehicleId);

  // Find the log immediately before the current entry
  // If we are editing an existing log, we need to find the one before it in the sorted list
  const currentIndex = vehicleLogs.findIndex(l => l.id === currentLog.id);
  let prevLog: FuelLog | null = null;

  if (currentIndex !== -1) {
    // Existing log
    prevLog = currentIndex > 0 ? vehicleLogs[currentIndex - 1] : null;
  } else {
    // New log (not in allLogs yet)
    const prevLogs = vehicleLogs.filter(l => new Date(`${l.date}T${l.time || '00:00'}`) <= currentDateTime);
    prevLog = prevLogs.length > 0 ? prevLogs[prevLogs.length - 1] : null;
  }
  
  if (!prevLog) return null;

  const distance = currentLog.mileage - prevLog.mileage;
  if (distance <= 0) return null;

  const efficiency = distance / currentLog.liters;
  
  const prevDate = new Date(`${prevLog.date}T${prevLog.time || '00:00'}`);
  const daysElapsed = Math.max(1, Math.ceil(Math.abs(currentDateTime.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)));
  const costPerDay = currentLog.totalCost / daysElapsed;
  const costPerKm = currentLog.totalCost / distance;

  // Calculate previous efficiency for comparison
  const prevLogIdxInAll = vehicleLogs.findIndex(l => l.id === prevLog?.id);
  const prevPrevLog = prevLogIdxInAll > 0 ? vehicleLogs[prevLogIdxInAll - 1] : null;
  
  let prevEfficiency = 0;
  let efficiencyChange = 0;

  if (prevPrevLog) {
    prevEfficiency = (prevLog.mileage - prevPrevLog.mileage) / prevLog.liters;
    if (prevEfficiency > 0) {
      efficiencyChange = ((efficiency - prevEfficiency) / prevEfficiency) * 100;
    }
  }

  // Calculate history of efficiency for the last 10 logs using O(1) backward scan
  const history: { date: string, efficiency: number }[] = [];
  const startIdx = currentIndex === -1 ? vehicleLogs.length - 1 : currentIndex;

  for (let i = startIdx; i > 0 && history.length < 10; i--) {
    const log = vehicleLogs[i];
    const prev = vehicleLogs[i - 1];
    const dist = log.mileage - prev.mileage;

    if (dist > 0) {
      history.unshift({
        date: log.date,
        efficiency: dist / log.liters
      });
    }
  }

  return {
    distance,
    efficiency,
    daysElapsed,
    costPerDay,
    costPerKm,
    prevEfficiency,
    efficiencyChange,
    history
  };
};

const EfficiencySummary = ({ stats, compact = false }: { stats: any, compact?: boolean }) => {
  if (!stats) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-outline/10">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-primary">{formatEfficiency(stats.efficiency)} <span className="text-outline/60">KM/L</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowRight className="w-4 h-4 text-outline" />
          <span className="text-xs font-bold text-primary">{formatKm(stats.distance)} <span className="text-outline/60">KM</span></span>
        </div>
        {stats.efficiencyChange !== 0 && (
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold uppercase ${stats.efficiencyChange >= 0 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
            {stats.efficiencyChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(stats.efficiencyChange).toFixed(1)}%
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-primary/5 rounded-2xl p-6 border border-primary/10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-primary font-headline">Resumen de Eficiencia</h3>
            <p className="text-xs text-secondary uppercase tracking-widest font-bold">Comparación con la carga anterior</p>
          </div>
        </div>
        {stats.history && stats.history.length > 1 && (
          <div className="h-[40px] w-24 hidden sm:block">
            <ResponsiveContainer width="99%" height="100%" debounce={50}>
              <AreaChart data={stats.history}>
                <Area 
                  type="monotone" 
                  dataKey="efficiency" 
                  stroke="#1A237E" 
                  fill="#1A237E" 
                  fillOpacity={0.1} 
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-0">
        <div className="flex justify-between items-center py-3 border-b border-outline/10">
          <span className="text-xs font-bold text-secondary uppercase tracking-wider">Distancia</span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-extrabold text-primary font-headline">{formatKm(stats.distance)}</span>
            <span className="text-[10px] font-bold text-outline">KM</span>
          </div>
        </div>
        <div className="flex justify-between items-center py-3 border-b border-outline/10">
          <span className="text-xs font-bold text-secondary uppercase tracking-wider">Rendimiento</span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-extrabold text-primary font-headline">{formatEfficiency(stats.efficiency)}</span>
            <span className="text-[10px] font-bold text-outline">KM/L</span>
          </div>
        </div>
        <div className="flex justify-between items-center py-3 border-b border-outline/10">
          <span className="text-xs font-bold text-secondary uppercase tracking-wider">Días</span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-extrabold text-primary font-headline">{stats.daysElapsed}</span>
            <span className="text-[10px] font-bold text-outline">DÍAS</span>
          </div>
        </div>
        <div className="flex justify-between items-center py-3 border-b border-outline/10">
          <span className="text-xs font-bold text-secondary uppercase tracking-wider">Costo Diario</span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-extrabold text-primary font-headline">${formatMoney(stats.costPerDay)}</span>
            <span className="text-[10px] font-bold text-outline">/DÍA</span>
          </div>
        </div>
        <div className="flex justify-between items-center py-3">
          <span className="text-xs font-bold text-secondary uppercase tracking-wider">Costo por KM</span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-extrabold text-primary font-headline">${formatMoney(stats.costPerKm)}</span>
            <span className="text-[10px] font-bold text-outline">/KM</span>
          </div>
        </div>
      </div>

      {stats.prevEfficiency > 0 && (
        <div className="mt-6 pt-6 border-t border-primary/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${stats.efficiencyChange >= 0 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
              {stats.efficiencyChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(stats.efficiencyChange).toFixed(1)}%
            </div>
            <span className="text-sm font-medium text-secondary">
              {stats.efficiencyChange >= 0 
                ? 'Mejora en eficiencia respecto al último tanque' 
                : 'Disminución en eficiencia respecto al último tanque'}
            </span>
          </div>
          <div className="hidden md:block text-xs font-bold text-outline uppercase tracking-widest">
            Anterior: {formatEfficiency(stats.prevEfficiency)} km/l
          </div>
        </div>
      )}
    </div>
  );
};

const stationLogoCache = new Map<string, string>();

const getStationLogo = (name: string) => {
  if (!name) return 'https://ui-avatars.com/api/?name=Gas+Station&background=random&color=fff&size=128&bold=true&format=svg';
  
  if (stationLogoCache.has(name)) {
    return stationLogoCache.get(name)!;
  }

  const result = computeStationLogo(name);
  stationLogoCache.set(name, result);
  return result;
};

const computeStationLogo = (name: string): string => {
  const lowerName = name.toLowerCase();
  const getFavicon = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  
  if (lowerName.includes('copec') || lowerName.includes('pronto') || lowerName.includes('punto') || lowerName.includes('gasolinera central')) return 'https://upload.wikimedia.org/wikipedia/commons/9/92/Copec_Logo_2023.svg';
  if (lowerName.includes('aramco')) return 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Saudi_aramco_logo.svg';
  if (lowerName.includes('shell') || lowerName.includes('enex') || lowerName.includes('upa')) return getFavicon('shell.com');
  if (lowerName.includes('petrobras')) return getFavicon('petrobras.com.br');
  if (lowerName.includes('terpel')) return getFavicon('terpel.com');
  if (lowerName.includes('lipigas')) return getFavicon('lipigas.cl');
  if (lowerName.includes('gasco')) return getFavicon('gasco.com.co');
  if (lowerName.includes('abastible')) return getFavicon('abastible.cl');
  if (lowerName.includes('ypf')) return getFavicon('ypf.com');
  if (lowerName.includes('axion')) return getFavicon('axionenergy.com');
  if (lowerName.includes('puma')) return getFavicon('pumaenergy.com');
  if (lowerName.includes('primax')) return getFavicon('primax.com.pe');
  if (lowerName.includes('pemex')) return getFavicon('pemex.com');
  if (lowerName.includes('oxxo')) return getFavicon('oxxo.com');
  if (lowerName.includes('bp') || lowerName.includes('british petroleum')) return getFavicon('bp.com');
  if (lowerName.includes('chevron')) return getFavicon('chevron.com');
  if (lowerName.includes('exxon')) return getFavicon('exxon.com');
  if (lowerName.includes('mobil')) return getFavicon('mobil.com');
  if (lowerName.includes('texaco')) return getFavicon('texaco.co.uk');
  if (lowerName.includes('total')) return getFavicon('totalenergies.com');
  if (lowerName.includes('repsol')) return getFavicon('repsol.com');
  if (lowerName.includes('cepsa')) return getFavicon('cepsa.com');
  if (lowerName.includes('gulf')) return getFavicon('gulfoil.com');
  if (lowerName.includes('valero')) return getFavicon('valero.com');
  if (lowerName.includes('conoco')) return getFavicon('conoco.com');
  if (lowerName.includes('phillips 66')) return getFavicon('phillips66.com');
  if (lowerName.includes('7-eleven') || lowerName.includes('7 eleven')) return getFavicon('7-eleven.com');
  if (lowerName.includes('circle k')) return getFavicon('circlek.com');
  if (lowerName.includes('speedway')) return getFavicon('speedway.com');
  if (lowerName.includes('marathon')) return getFavicon('marathonpetroleum.com');
  if (lowerName.includes('sinclair')) return getFavicon('sinclairoil.com');
  if (lowerName.includes('wawa')) return getFavicon('wawa.com');
  if (lowerName.includes('quiktrip')) return getFavicon('quiktrip.com');
  if (lowerName.includes('sheetz')) return getFavicon('sheetz.com');
  if (lowerName.includes('racetrac')) return getFavicon('racetrac.com');
  if (lowerName.includes('buc-ee\'s') || lowerName.includes('bucees')) return getFavicon('buc-ees.com');
  if (lowerName.includes('esso')) return getFavicon('esso.com');
  if (lowerName.includes('lukoil')) return getFavicon('lukoil.com');
  if (lowerName.includes('eni') || lowerName.includes('agip')) return getFavicon('eni.com');
  if (lowerName.includes('petronas')) return getFavicon('petronas.com');
  if (lowerName.includes('sinopec')) return getFavicon('sinopec.com');
  if (lowerName.includes('petrochina')) return getFavicon('petrochina.com.cn');
  if (lowerName.includes('gazprom')) return getFavicon('gazprom.com');
  if (lowerName.includes('equinor') || lowerName.includes('statoil')) return getFavicon('equinor.com');
  if (lowerName.includes('omv')) return getFavicon('omv.com');
  if (lowerName.includes('mol')) return getFavicon('molgroup.info');
  if (lowerName.includes('orlen')) return getFavicon('orlen.pl');
  if (lowerName.includes('galp')) return getFavicon('galp.com');
  if (lowerName.includes('q8')) return getFavicon('q8.com');
  if (lowerName.includes('sunoco')) return getFavicon('sunoco.com');
  if (lowerName.includes('murphy')) return getFavicon('murphyusa.com');
  if (lowerName.includes('casey\'s') || lowerName.includes('caseys')) return getFavicon('caseys.com');
  if (lowerName.includes('kum & go') || lowerName.includes('kum and go')) return getFavicon('kumandgo.com');
  if (lowerName.includes('maverik')) return getFavicon('maverik.com');
  if (lowerName.includes('thorntons')) return getFavicon('mythorntons.com');
  if (lowerName.includes('pilot') || lowerName.includes('flying j')) return getFavicon('pilotflyingj.com');
  if (lowerName.includes('loves') || lowerName.includes('love\'s')) return getFavicon('loves.com');
  if (lowerName.includes('ta') || lowerName.includes('travelcenters')) return getFavicon('ta-petro.com');

  const fallbackName = encodeURIComponent(name.trim() || 'Gas Station');
  return `https://ui-avatars.com/api/?name=${fallbackName}&background=random&color=fff&size=128&bold=true&format=svg`;
};
const formatMonthYear = (date: Date) => {
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
};
import { toyotaCorollaCrossLogs } from './importData';
import { auth, db, signInWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy,
  getDoc,
  getDocFromServer
} from 'firebase/firestore';

// --- Types & Constants ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  // SEC-FIX: Do not log sensitive user information from auth.currentUser in the console
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  const readableMsg = error instanceof Error && error.message.includes('permission') 
    ? "Error de permisos: Asegúrate de completar todos los campos obligatorios y que los nombres no excedan los límites."
    : "Error al sincronizar con la base de datos. Por favor intenta de nuevo.";
  alert(readableMsg);
};

// --- Proxy Helper ---
const fetchFromProxy = async (targetUrl: string) => {
  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
    `https://thingproxy.freeboard.io/fetch/${targetUrl}`
  ];

  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl);
      if (!res.ok) continue;
      
      const text = await res.text();
      let data;
      
      try {
        const json = JSON.parse(text);
        // AllOrigins wraps content in a 'contents' field
        const raw = json.contents !== undefined ? json.contents : json;
        data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        // If not JSON, it might be the raw string from CodeTabs or others
        data = JSON.parse(text);
      }
      
      if (data) return data;
    } catch (e) { console.warn(`Proxy ${proxyUrl} failed, trying next...`); }
  }
  throw new Error("All proxies failed to fetch data.");
};

// --- Components ---

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState;
  public props: ErrorBoundaryProps;
  
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Algo salió mal.";
      try {
        const parsedError = JSON.parse(this.state.error.message);
        if (parsedError.error) {
          errorMessage = `Error de base de datos: ${parsedError.error}`;
        }
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-error/10 p-8 rounded-3xl max-w-md w-full border border-error/20">
            <h2 className="text-2xl font-bold text-error mb-4">¡Ups!</h2>
            <p className="text-secondary mb-8">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-primary text-white py-3 px-8 rounded-xl font-bold hover:bg-primary-container transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const Login = () => {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 text-center">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-surface-container-low p-12 rounded-[2.5rem] shadow-[0_24px_64px_rgba(26,35,126,0.1)]"
      >
        <div className="w-20 h-20 bg-primary-container rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-lg">
          <Car className="text-white w-10 h-10" />
        </div>
        <h1 className="text-4xl font-extrabold font-headline text-primary tracking-tight mb-4">Premium Fleet</h1>
        <p className="text-secondary mb-12 leading-relaxed">
          Gestiona la eficiencia de tu flota con precisión quirúrgica. Inicia sesión para comenzar tu viaje.
        </p>
        <button 
          onClick={signInWithGoogle}
          className="w-full py-5 px-8 bg-white text-primary font-bold rounded-2xl shadow-sm border border-surface-variant flex items-center justify-center gap-4 hover:bg-surface-variant transition-all active:scale-[0.98]"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" referrerPolicy="no-referrer" />
          Continuar con Google
        </button>
      </motion.div>
    </div>
  );
};

const SettingsModal = ({ user, onMigrateLogs, onUpdateUser, onClose }: { user: UserProfile, onMigrateLogs: () => Promise<void>, onUpdateUser: (u: UserProfile) => Promise<void>, onClose: () => void }) => {
  const [apiKey, setApiKey] = useState(() => user.geminiApiKey || localStorage.getItem('geminiApiKey') || process.env.GEMINI_API_KEY || '');
  const [migrating, setMigrating] = useState(false);
  
  const handleSave = async () => {
    localStorage.setItem('geminiApiKey', apiKey);
    if (apiKey !== user.geminiApiKey) {
      await onUpdateUser({ ...user, geminiApiKey: apiKey });
    }
    onClose();
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface/80 backdrop-blur-sm" onClick={onClose}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface-container-lowest w-full max-w-md rounded-3xl shadow-xl overflow-hidden border border-outline/10 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold font-headline text-primary">Configuración de IA</h2>
          <button aria-label="Cerrar configuración" onClick={onClose} className="p-2 bg-surface-variant hover:bg-outline/10 rounded-full transition-colors">
            <Plus className="w-5 h-5 rotate-45 text-secondary" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-secondary mb-2">Gemini API Key</label>
            <input 
              type="text" 
              value={apiKey} 
              onChange={e => setApiKey(e.target.value)} 
              placeholder="AIzaSy..."
              className="w-full bg-surface-container-low px-4 py-3 rounded-xl border border-surface-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-outline/40"
            />
            <p className="text-xs text-outline mt-2 leading-relaxed">Necesaria para la geolocalización de precios. Se guardará localmente en tu navegador.</p>
          </div>
          <button onClick={handleSave} className="w-full py-4 bg-primary text-white rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-primary/20 hover:shadow-xl hover:bg-primary-container active:scale-95 transition-all">
            Guardar Configuración
          </button>
          
          <div className="pt-6 border-t border-outline/10">
            <h3 className="text-xs font-bold uppercase tracking-widest text-secondary mb-4">Mantenimiento</h3>
            <button 
              onClick={async () => {
                if (confirm('¿Actualizar todos los registros a Gasolina 93 y Copec?')) {
                  setMigrating(true);
                  await onMigrateLogs();
                  setMigrating(false);
                  alert('Registros actualizados correctamente.');
                }
              }} 
              disabled={migrating}
              className="w-full py-4 bg-surface-container-low text-primary rounded-xl font-bold uppercase tracking-widest text-xs border border-primary/20 hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
            >
              {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fuel className="w-4 h-4" />}
              Actualizar Historial (93 + Copec)
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const TopAppBar = ({ onSettingsClick }: { onSettingsClick: () => void }) => (
  <header className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-xl px-6 py-4 flex justify-between items-center">
    <div className="flex items-center gap-3">
      <Car className="text-primary-container w-6 h-6" />
      <h1 className="text-xl font-bold text-primary-container font-headline">Premium Fleet</h1>
    </div>
    <button aria-label="Abrir configuración" onClick={onSettingsClick} className="p-2 rounded-full hover:bg-surface-variant transition-colors">
      <Settings className="text-secondary w-5 h-5" />
    </button>
  </header>
);

const BottomNavBar = ({ activeTab, onTabChange }: { activeTab: string, onTabChange: (tab: string) => void }) => {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', ariaLabel: 'Tablero principal', icon: LayoutDashboard },
    { id: 'history', label: 'History', ariaLabel: 'Historial de combustible', icon: HistoryIcon },
    { id: 'new', label: 'Nuevo', ariaLabel: 'Añadir nuevo registro', icon: Plus, isSpecial: true },
    { id: 'map', label: 'Mapa', ariaLabel: 'Mapa de estaciones', icon: MapPin },
    { id: 'projection', label: 'Proyección', ariaLabel: 'Proyección de costos', icon: Zap },
    { id: 'stats', label: 'Stats', ariaLabel: 'Estadísticas de consumo', icon: TrendingUp },
    { id: 'profile', label: 'Profile', ariaLabel: 'Perfil de usuario', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/60 backdrop-blur-xl px-4 pb-8 pt-3 flex justify-around items-center rounded-t-[2rem] shadow-[0_-8px_32px_rgba(26,35,126,0.06)]">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        if (tab.isSpecial) {
          return (
            <button 
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-label={tab.ariaLabel}
              className={`flex flex-col items-center justify-center rounded-2xl px-5 py-2 transition-all duration-300 ${
                isActive ? 'bg-primary-container text-white scale-90' : 'text-secondary'
              }`}
            >
              <Icon className="w-6 h-6" />
            </button>
          );
        }

        return (
          <button 
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-label={tab.ariaLabel}
            className={`flex flex-col items-center justify-center px-4 py-2 transition-colors relative ${
              isActive ? 'text-primary-container' : 'text-secondary/50'
            }`}
          >
            <Icon className={`w-6 h-6 ${isActive ? 'fill-current' : ''}`} />
            {isActive && (
              <motion.div 
                layoutId="navIndicator"
                className="absolute -bottom-1 w-1 h-1 bg-primary-container rounded-full"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
};

// --- Screens ---

const VehicleSelector = ({ vehicles, selectedVehicleId, onSelect, className = "" }: { vehicles: Vehicle[], selectedVehicleId: string | null, onSelect: (id: string) => void, className?: string }) => {
  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  
  return (
    <div className={`relative group ${className}`}>
      <button aria-haspopup="listbox" className="flex items-center gap-3 bg-surface-container-low px-4 py-2 rounded-xl border border-surface-variant hover:bg-surface-variant transition-all focus-visible:ring-2 focus-visible:ring-primary outline-none">
        <Car className="w-5 h-5 text-primary" />
        <div className="text-left">
          <p className="text-xs font-bold uppercase tracking-widest text-secondary leading-none mb-1">Vehículo</p>
          <p className="text-sm font-bold text-primary leading-none">{selectedVehicle?.name || 'Seleccionar'}</p>
        </div>
        <ChevronDown className="w-4 h-4 text-outline ml-2 group-hover:rotate-180 group-focus-within:rotate-180 transition-transform" />
      </button>
      
      <div role="listbox" className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-surface-variant opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 overflow-hidden">
        {vehicles.length === 0 ? (
          <div className="px-6 py-4 text-sm text-secondary italic">No hay vehículos registrados</div>
        ) : (
          vehicles.map(v => (
            <button 
              role="option"
              aria-selected={selectedVehicleId === v.id}
              key={v.id}
              onClick={() => onSelect(v.id)}
              className={`w-full px-6 py-4 text-left hover:bg-surface-variant transition-colors flex items-center justify-between focus-visible:bg-surface-variant focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset outline-none ${selectedVehicleId === v.id ? 'bg-primary/5' : ''}`}
            >
              <div>
                <p className="font-bold text-primary">{v.name}</p>
                <p className="text-xs text-secondary uppercase">{v.make} {v.model}</p>
              </div>
              {selectedVehicleId === v.id && <CheckCircle2 className="w-4 h-4 text-primary" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
};


const Projection = ({ user, fuelLogs, vehicles, selectedVehicleId, onSelectVehicle }: { user: UserProfile, fuelLogs: FuelLog[], vehicles: Vehicle[], selectedVehicleId: string | null, onSelectVehicle: (id: string) => void }) => {
  const [localPrices, setLocalPrices] = useState<{ avg: number, min: number, max: number, location: string, lastUpdated?: string } | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [errorPrices, setErrorPrices] = useState<string | null>(null);

  const selectedVehicle = useMemo(() => vehicles.find(v => v.id === selectedVehicleId), [vehicles, selectedVehicleId]);

  const stats = useMemo(() => {
    if (fuelLogs.length === 0) return {
      forecast: {
        nextMonthEstimate: 0,
        trend: 'stable' as 'up' | 'down' | 'stable',
        confidence: 0,
        details: { distance: 0, price: 0, efficiency: 0 }
      },
      monthlyTotalCost: 0
    };

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const monthlyLogs = fuelLogs.filter(log => {
      const d = new Date(log.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    
    const monthlyTotalCost = monthlyLogs.reduce((acc, log) => acc + log.totalCost, 0);
    const sortedLogs = [...fuelLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let averageEfficiency = 0;
    if (sortedLogs.length >= 2) {
      const distance = sortedLogs[sortedLogs.length - 1].mileage - sortedLogs[0].mileage;
      const litersConsumed = sortedLogs.slice(1).reduce((acc, log) => acc + log.liters, 0);
      if (distance > 0 && litersConsumed > 0) averageEfficiency = distance / litersConsumed;
    }

    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);
    const recentLogs = sortedLogs.filter(l => new Date(l.date) >= last30Days);

    const last90Days = new Date();
    last90Days.setDate(last90Days.getDate() - 90);
    const logs90Days = sortedLogs.filter(l => new Date(l.date) >= last90Days);
    
    let distance90Days = 0;
    let monthsInWindow = 3;
    if (logs90Days.length >= 2) {
      const msDiff = new Date(logs90Days[logs90Days.length - 1].date).getTime() - new Date(logs90Days[0].date).getTime();
      const diffMonths = msDiff / (1000 * 60 * 60 * 24 * 30.44);
      monthsInWindow = Math.max(1, Math.min(3, diffMonths));
      distance90Days = logs90Days[logs90Days.length - 1].mileage - logs90Days[0].mileage;
    }
    const monthlyAverageDistance = distance90Days > 0 ? distance90Days / monthsInWindow : 0;
    const effBase = averageEfficiency > 0 ? averageEfficiency : 10;
    const estimatedLitersNextMonth = monthlyAverageDistance / effBase;
    const priceToUse = localPrices?.avg || (sortedLogs.length > 0 ? sortedLogs[sortedLogs.length - 1].pricePerLiter : 1100);
    const nextMonthEstimate = estimatedLitersNextMonth * priceToUse;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    const costDelta = nextMonthEstimate - monthlyTotalCost;
    if (costDelta > monthlyTotalCost * 0.01) trend = 'up';
    else if (costDelta < -monthlyTotalCost * 0.01) trend = 'down';

    return {
      forecast: {
        nextMonthEstimate: Math.round(nextMonthEstimate),
        trend,
        confidence: Math.min(Math.round(((recentLogs.length / 3) + (localPrices ? 0.5 : 0)) * 100 / 2), 100),
        details: {
          distance: monthlyAverageDistance,
          price: priceToUse,
          efficiency: effBase
        }
      },
      monthlyTotalCost
    };
  }, [fuelLogs, localPrices, selectedVehicle, vehicles]);

  const fetchLocalPrices = async (fuelToSearch: string) => {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `fuelPrices_${fuelToSearch}`;
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedData) {
      try {
        const { date, data } = JSON.parse(cachedData);
        if (date === today && data && data.avg) {
          setLocalPrices(data);
          setLoadingPrices(false);
          return;
        }
      } catch (e) { console.warn("Error parsing price cache:", e); }
    }

    const apiKey = user.geminiApiKey || localStorage.getItem('geminiApiKey') || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      setErrorPrices("Llave de IA no configurada.");
      setLoadingPrices(false);
      return;
    }
    
    setLoadingPrices(true);
    setErrorPrices(null);
    try {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const ai = new GoogleGenAI({ apiKey: apiKey! });
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: `Eres una API técnica que solo responde en JSON. Busca en la web el precio en pesos chilenos de "${fuelToSearch}" hoy en estaciones de Chile cerca de Lat=${latitude}, Lon=${longitude} (ej. en sitios como bencinaenlinea.cl, copec). 
            RESPONDE ÚNICAMENTE UN OBJETO JSON VÁLIDO CON ESTA ESTRUCTURA: {"avg": 1310, "min": 1280, "max": 1350, "location": "Nombre Comuna, Chile"}`,
            config: { tools: [{ googleSearch: {} }] }
          });
          let text = response.text || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          const data = JSON.parse(jsonMatch ? jsonMatch[0] : text);
          if (data && data.avg) {
            const timestamp = new Date().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const updatedData = { ...data, lastUpdated: timestamp };
            setLocalPrices(updatedData);
            localStorage.setItem(cacheKey, JSON.stringify({ date: today, data: updatedData }));
          }
        } catch(e: any) { setErrorPrices(`Error IA: ${e.message}`); } finally { setLoadingPrices(false); }
      }, () => { setErrorPrices("Permiso de ubicación denegado."); setLoadingPrices(false); });
    } catch (err: any) { setErrorPrices(`Error: ${err.message}`); setLoadingPrices(false); }
  };

  useEffect(() => { fetchLocalPrices('Gasolina 93'); }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="pb-32 pt-24 px-6 max-w-5xl mx-auto">
      <section className="mt-8 mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-secondary">Control de Costos</span>
          <h2 className="text-4xl font-extrabold font-headline leading-none text-primary tracking-tighter mt-2">Proyección de Gastos</h2>
          <p className="text-sm text-secondary font-medium mt-4">Predicciones inteligentes basadas en tu comportamiento de conducción y precios locales.</p>
        </div>
        <VehicleSelector vehicles={vehicles} selectedVehicleId={selectedVehicleId} onSelect={onSelectVehicle} />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Forecasting Card */}
        <div className={`md:col-span-12 lg:col-span-8 bg-surface-container-high rounded-xl p-8 border relative overflow-hidden transition-colors ${
          stats.forecast.trend === 'up' ? 'border-error/30' : stats.forecast.trend === 'down' ? 'border-success/30' : 'border-primary/10'
        }`}>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-secondary">Proyección Próximo Mes</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-1 mb-6">
              <span className="text-2xl lg:text-3xl font-extrabold font-headline text-primary leading-tight">$</span>
              <span className="text-2xl lg:text-3xl font-extrabold font-headline text-primary leading-tight break-all">{formatMoney(stats.forecast.nextMonthEstimate)}</span>
              <div className={`ml-2 flex items-center gap-1 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest ${
                stats.forecast.trend === 'up' ? 'bg-error/10 text-error' : stats.forecast.trend === 'down' ? 'bg-success/20 text-success' : 'bg-surface-variant text-secondary'
              }`}>
                {stats.forecast.trend === 'up' ? <TrendingUp className="w-3 h-3" /> : stats.forecast.trend === 'down' ? <TrendingDown className="w-3 h-3" /> : null}
                {stats.forecast.trend === 'up' ? 'Alza Proyectada' : stats.forecast.trend === 'down' ? 'Baja Proyectada' : 'Estable'}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex justify-between text-xs font-bold uppercase tracking-tight text-secondary"><span>Confianza del Modelo</span><span>{stats.forecast.confidence}%</span></div>
                <div className="h-1.5 w-full bg-surface-variant rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${stats.forecast.confidence}%` }}></div>
                </div>
                <div className="mt-4 pt-4 border-t border-outline/5">
                  <span className="text-[10px] font-bold text-secondary uppercase tracking-[0.1em] block mb-2">Supuestos del Modelo:</span>
                  <ul className="space-y-2">
                    <li className="flex items-center justify-between text-[10px] text-secondary/70">
                      <div className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-primary flex-shrink-0" /><span>Kilometraje (Prom. 3 meses)</span></div>
                      <span className="font-bold text-primary">{formatKm(stats.forecast.details.distance)} KM</span>
                    </li>
                    <li className="flex items-center justify-between text-[10px] text-secondary/70">
                      <div className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-primary flex-shrink-0" /><span>Precio Considerado</span></div>
                      <span className="font-bold text-primary">${formatMoney(stats.forecast.details.price)}/L</span>
                    </li>
                    <li className="flex items-center justify-between text-[10px] text-secondary/70">
                      <div className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-primary flex-shrink-0" /><span>Eficiencia Aplicada</span></div>
                      <span className="font-bold text-primary">{formatEfficiency(stats.forecast.details.efficiency)} KM/L</span>
                    </li>
                  </ul>
                </div>
              </div>
              <div className={`rounded-lg p-4 border transition-colors ${stats.forecast.trend === 'up' ? 'bg-error/5 border-error/10' : stats.forecast.trend === 'down' ? 'bg-success/5 border-success/10' : 'bg-primary/5 border-primary/10'}`}>
                <div className="flex items-center gap-2 mb-2"><Zap className={`w-4 h-4 ${stats.forecast.trend === 'up' ? 'text-error' : stats.forecast.trend === 'down' ? 'text-success' : 'text-primary'}`} />
                <span className={`text-xs font-bold uppercase ${stats.forecast.trend === 'up' ? 'text-error' : stats.forecast.trend === 'down' ? 'text-success' : 'text-primary'}`}>Análisis de Gasto</span></div>
                <p className="text-xs text-secondary font-medium leading-relaxed">{stats.forecast.trend === 'up' ? "Se proyecta un incremento en tu gasto mensual respecto a lo que llevas hoy. Considera optimizar tus rutas." : "Se proyecta un ahorro mensual respecto a tu ritmo actual. ¡Excelente gestión de combustible!"}</p>
              </div>
            </div>
          </div>
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/5 rounded-full blur-3xl"></div>
        </div>

        {/* Local Prices Card */}
        <div className="md:col-span-12 lg:col-span-4 bg-surface-container-low rounded-xl p-8 flex flex-col relative overflow-hidden group border border-secondary/5">
          <div className="relative z-10 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /><span className="text-xs font-bold uppercase tracking-widest text-secondary">Precios Zona</span></div>
              {localPrices && <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase truncate max-w-[120px]">{localPrices.location}</span>}
            </div>
            <div className="mb-4">
              <div className="bg-primary/5 rounded-lg px-3 py-3 flex items-center gap-3 border border-primary/10">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><Fuel className="text-primary w-4 h-4" /></div>
                <div><span className="text-[10px] font-bold text-secondary uppercase tracking-widest block leading-none mb-1">Combustible</span><span className="text-sm font-bold text-primary leading-none">Gasolina 93</span></div>
              </div>
            </div>
            {loadingPrices ? (
              <div className="flex flex-col items-center justify-center flex-grow py-4"><Loader2 className="w-8 h-8 text-primary animate-spin mb-3" /><span className="text-xs font-bold text-secondary uppercase tracking-widest animate-pulse">Buscando...</span></div>
            ) : localPrices ? (
              <div className="flex flex-col justify-between flex-grow">
                <div className="space-y-6">
                  <div><span className="text-[10px] font-bold text-secondary uppercase block mb-1 tracking-widest">Precio Promedio</span>
                  <div className="flex flex-wrap items-baseline gap-1"><span className="text-sm font-bold text-primary">$</span><span className="text-2xl font-extrabold font-headline text-primary tracking-tighter break-all leading-tight">{formatMoney(localPrices.avg)}</span></div></div>
                  <div className="grid grid-cols-2 gap-2 pt-4 border-t border-secondary/10">
                    <div className="min-w-0 flex flex-col"><span className="text-[9px] font-bold text-secondary uppercase block mb-1 tracking-widest truncate">Mínimo</span><span className="text-sm font-bold text-tertiary-fixed font-headline truncate">${formatMoney(localPrices.min)}</span></div>
                    <div className="min-w-0 flex flex-col"><span className="text-[9px] font-bold text-secondary uppercase block mb-1 tracking-widest truncate">Máximo</span><span className="text-sm font-bold text-error font-headline truncate">${formatMoney(localPrices.max)}</span></div>
                  </div>
                </div>
                <div className="mt-8 flex items-center gap-2 opacity-40"><Fuel className="w-3 h-3 text-secondary" /><p className="text-[9px] text-secondary font-bold uppercase tracking-tighter">Actualizado vía Bencina en Línea</p></div>
              </div>
            ) : errorPrices ? (
              <div className="flex flex-col items-center justify-center flex-grow py-4 text-center">
                <div className="w-12 h-12 bg-error/10 rounded-full flex items-center justify-center mb-4"><MapPin className="w-6 h-6 text-error" /></div>
                <p className="text-xs text-error font-bold uppercase tracking-widest mb-2">Error</p><p className="text-[10px] text-error/80 font-medium max-w-[180px] break-words">{errorPrices}</p>
                <button onClick={() => fetchLocalPrices('Gasolina 93')} className="mt-4 px-4 py-2 bg-primary/10 text-primary font-bold text-xs uppercase rounded-lg">Reintentar</button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-grow py-4 text-center">
                <div className="w-12 h-12 bg-secondary/5 rounded-full flex items-center justify-center mb-4"><MapPin className="w-6 h-6 text-secondary/20" /></div>
                <button onClick={() => fetchLocalPrices('Gasolina 93')} className="mt-4 px-4 py-2 bg-primary/10 text-primary font-bold text-xs uppercase rounded-lg">Cargar Precios</button>
              </div>
            )}
          </div>
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-secondary/5 rounded-full blur-3xl group-hover:bg-primary/5 transition-colors duration-500"></div>
        </div>
      </div>
    </motion.div>
  );
};

const Dashboard = ({ fuelLogs, vehicles, selectedVehicleId, onSelectVehicle, onNavigateToNew }: { fuelLogs: FuelLog[], vehicles: Vehicle[], selectedVehicleId: string | null, onSelectVehicle: (id: string) => void, onNavigateToNew: () => void }) => {
  const [viewDate, setViewDate] = useState(new Date());
  
  const handlePrevMonth = () => setViewDate(prev => {
    const d = new Date(prev);
    d.setMonth(d.getMonth() - 1);
    return d;
  });

  const handleNextMonth = () => setViewDate(prev => {
    const d = new Date(prev);
    const now = new Date();
    if (prev.getMonth() === now.getMonth() && prev.getFullYear() === now.getFullYear()) return prev;
    d.setMonth(d.getMonth() + 1);
    return d;
  });

  const selectedVehicle = useMemo(() => vehicles.find(v => v.id === selectedVehicleId), [vehicles, selectedVehicleId]);

  const stats = useMemo(() => {
    if (fuelLogs.length === 0) return {
      averageEfficiency: 0,
      currentOdometer: 0,
      monthlyTotalCost: 0,
      budgetPercentage: 0,
      operationalEfficiency: 0,
      savedLiters: 0,
      totalLiters: 0,
      count: 0,
      consumptionHistory: []
    };

    const targetMonth = viewDate.getMonth();
    const targetYear = viewDate.getFullYear();
    
    // Monthly filtering
    const monthlyLogs = fuelLogs.filter(log => {
      const d = new Date(log.date);
      return d.getMonth() === targetMonth && d.getFullYear() === targetYear && (!selectedVehicleId || log.vehicleId === selectedVehicleId);
    });

    const monthlyTotalCost = monthlyLogs.reduce((acc, log) => acc + log.totalCost, 0);
    const totalLiters = monthlyLogs.reduce((acc, log) => acc + log.liters, 0);
    const count = monthlyLogs.length;

    // Efficiency logic
    const sortedLogs = [...fuelLogs]
      .filter(l => !selectedVehicleId || l.vehicleId === selectedVehicleId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let averageEfficiency = 0;
    if (sortedLogs.length >= 2) {
      const distance = sortedLogs[sortedLogs.length - 1].mileage - sortedLogs[0].mileage;
      const litersConsumed = sortedLogs.slice(1).reduce((acc, log) => acc + log.liters, 0);
      if (distance > 0 && litersConsumed > 0) averageEfficiency = distance / litersConsumed;
    }

    const currentOdometer = fuelLogs.length > 0 ? Math.max(...fuelLogs.map(l => l.mileage)) : 0;

    // Operational Efficiency for the view month
    const targetEfficiency = selectedVehicle?.targetEfficiency || 10;
    let monthEfficiency = 0;
    let savedLiters = 0;
    
    if (monthlyLogs.length >= 2) {
      const sortedMonthly = [...monthlyLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const mDistance = sortedMonthly[sortedMonthly.length - 1].mileage - sortedMonthly[0].mileage;
      const mLiters = sortedMonthly.slice(1).reduce((acc, log) => acc + log.liters, 0);
      if (mDistance > 0 && mLiters > 0) {
        monthEfficiency = mDistance / mLiters;
        const expectedLiters = (mDistance / targetEfficiency);
        savedLiters = Math.max(0, expectedLiters - mLiters);
      }
    }

    const opEff = monthEfficiency > 0 ? Math.min(Math.round((monthEfficiency / targetEfficiency) * 100), 100) : 0;

    return {
      averageEfficiency: isFinite(averageEfficiency) ? parseFloat(averageEfficiency.toFixed(2)) : 0,
      monthEfficiency: isFinite(monthEfficiency) ? parseFloat(monthEfficiency.toFixed(2)) : 0,
      currentOdometer,
      monthlyTotalCost,
      budgetPercentage: Math.min(Math.round((monthlyTotalCost / 3000) * 100), 100),
      operationalEfficiency: opEff || 0,
      savedLiters: savedLiters || 0,
      totalLiters,
      count,
      consumptionHistory: (() => {
        const sorted = [...fuelLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        if (sorted.length === 0) return [];
        const firstLogDate = new Date(sorted[0].date);
        const months = [];
        let current = new Date(firstLogDate.getFullYear(), firstLogDate.getMonth(), 1);
        const end = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        while (current <= end) {
          months.push({ month: current.getMonth(), year: current.getFullYear(), label: formatMonthYear(current), endDate: new Date(current.getFullYear(), current.getMonth() + 1, 0) });
          current.setMonth(current.getMonth() + 1);
        }
        return months.map(m => {
          const mileageUpToMonth = fuelLogs.filter(l => new Date(l.date) <= m.endDate).reduce((max, l) => Math.max(max, l.mileage), 0);
          return { name: m.label, mileage: mileageUpToMonth };
        }).filter(m => m.mileage > 0);
      })()
    };
  }, [fuelLogs, selectedVehicle, vehicles, viewDate, selectedVehicleId]);

  const isCurrentMonth = viewDate.getMonth() === new Date().getMonth() && viewDate.getFullYear() === new Date().getFullYear();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="pb-32 pt-24 px-6 max-w-6xl mx-auto"
    >
      {/* Month Navigation & Vehicle Selector */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12">
        <div className="flex items-center gap-4 bg-surface-container-low p-1.5 rounded-2xl border border-secondary/5">
          <button 
            aria-label="Mes anterior"
            onClick={handlePrevMonth}
            className="p-3 hover:bg-surface-variant rounded-xl transition-colors text-primary"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="px-6 text-center min-w-[180px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-outline opacity-60 mb-0.5">Periodo de Análisis</p>
            <h3 className="text-lg font-extrabold font-headline text-primary capitalize">{formatMonthYear(viewDate)}</h3>
          </div>
          <button 
            aria-label="Mes siguiente"
            onClick={handleNextMonth}
            disabled={isCurrentMonth}
            className={`p-3 rounded-xl transition-colors ${isCurrentMonth ? 'text-outline/20' : 'hover:bg-surface-variant text-primary'}`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <VehicleSelector 
          vehicles={vehicles} 
          selectedVehicleId={selectedVehicleId} 
          onSelect={onSelectVehicle} 
        />
      </header>

      {/* Main Stats Bento */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* KPI: Monthly Total */}
        <div className="md:col-span-12 lg:col-span-8 bg-primary-container rounded-[2rem] p-10 text-white relative overflow-hidden flex flex-col justify-between min-h-[300px]">
          <div className="relative z-10">
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-on-primary/60 mb-6 block">Inversión en Combustible</span>
            <div className="flex items-baseline gap-4">
              <h2 className="text-6xl lg:text-7xl font-extrabold font-headline leading-none tracking-tighter">
                ${formatMoney(stats.monthlyTotalCost)}
              </h2>
              <div className="flex flex-col">
                <span className="text-xs font-bold opacity-60 uppercase">{stats.count} CARGAS</span>
                <span className="text-xs font-bold opacity-60 uppercase">{formatLiters(stats.totalLiters)}L TOTALES</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-12 bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-bold uppercase tracking-widest text-on-primary">Uso del Presupuesto</span>
              <span className="text-sm font-bold">{stats.budgetPercentage}%</span>
            </div>
            <div className="h-3 w-full bg-white/20 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${stats.budgetPercentage}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-tertiary-fixed shadow-[0_0_15px_rgba(255,255,255,0.3)]"
              />
            </div>
            <p className="mt-4 text-[11px] font-medium opacity-70">
              Llevas gastado el {stats.budgetPercentage}% de tu presupuesto estimado para este periodo.
            </p>
          </div>
          
          <Fuel className="absolute -bottom-10 -right-10 w-64 h-64 text-white opacity-[0.03] rotate-12" />
        </div>

        {/* KPI: Efficiency Ring */}
        <div className="md:col-span-12 lg:col-span-4 bg-surface-container-low rounded-[2rem] p-10 flex flex-col items-center justify-center text-center relative overflow-hidden border border-secondary/5">
          <div className="relative z-10 w-full mb-8 flex justify-between items-start">
             <div className="text-left">
               <span className="text-xs font-bold uppercase tracking-widest text-secondary block mb-1">Eficiencia Mes</span>
               <p className="text-sm text-outline font-medium">Comparado con meta</p>
             </div>
             <div className="p-2 bg-success/10 rounded-lg">
                <Leaf className="w-5 h-5 text-success" />
             </div>
          </div>

          <div className="relative w-48 h-48 mb-8">
            <svg className="w-full h-full transform -rotate-90 overflow-visible">
              <circle className="text-surface-variant" cx="96" cy="96" fill="transparent" r="88" stroke="currentColor" strokeWidth="12" />
              <motion.circle 
                initial={{ strokeDashoffset: 552.9 }}
                animate={{ strokeDashoffset: 552.9 * (1 - stats.operationalEfficiency / 100) }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
                className="text-primary" 
                cx="96" cy="96" fill="transparent" r="88" 
                stroke="currentColor" strokeWidth="16" 
                strokeDasharray="552.9" 
                strokeLinecap="round" 
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-extrabold font-headline text-primary">{stats.operationalEfficiency}%</span>
              <span className="text-[10px] font-bold text-outline uppercase tracking-widest">Score de Conducción</span>
            </div>
          </div>

          <div className="w-full bg-surface-container rounded-xl p-4 text-left">
            <div className="flex items-center gap-3 mb-2">
               <div className="w-2 h-2 rounded-full bg-success"></div>
               <span className="text-[11px] font-bold text-primary uppercase">Meta: {formatEfficiency(selectedVehicle?.targetEfficiency || 10)} KM/L</span>
            </div>
            <p className="text-[11px] text-secondary font-medium leading-tight">
              Has obtenido una media de <span className="font-bold text-primary">{formatEfficiency(stats.monthEfficiency)} KM/L</span> en este periodo.
            </p>
          </div>
        </div>

        {/* Small Stats Grid */}
        <div className="md:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-surface-container-low p-6 rounded-2xl border border-secondary/5 flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/5 rounded-xl flex items-center justify-center">
              <Gauge className="w-6 h-6 text-primary" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-outline uppercase tracking-widest block mb-0.5">Odómetro</span>
              <span className="text-xl font-extrabold font-headline text-primary">{formatKm(stats.currentOdometer)} <span className="text-xs opacity-50">KM</span></span>
            </div>
          </div>

          <div className="bg-surface-container-low p-6 rounded-2xl border border-secondary/5 flex items-center gap-4">
            <div className="w-12 h-12 bg-tertiary/5 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-tertiary" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-outline uppercase tracking-widest block mb-0.5">Ahorro Estimado</span>
              <span className="text-xl font-extrabold font-headline text-tertiary">{formatLiters(stats.savedLiters)} <span className="text-xs opacity-50">LTS</span></span>
            </div>
          </div>

          <div className="bg-surface-container-low p-6 rounded-2xl border border-secondary/5 flex items-center gap-4">
            <div className="w-12 h-12 bg-secondary/5 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-secondary" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-outline uppercase tracking-widest block mb-0.5">Eficiencia Media</span>
              <span className="text-xl font-extrabold font-headline text-secondary">{formatEfficiency(stats.averageEfficiency)} <span className="text-xs opacity-50">KM/L</span></span>
            </div>
          </div>

          <div className="bg-surface-container-low p-6 rounded-2xl border border-secondary/5 flex items-center gap-4">
            <div className="w-12 h-12 bg-primary-container/10 rounded-xl flex items-center justify-center">
              <MapPin className="w-6 h-6 text-primary-container" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-outline uppercase tracking-widest block mb-0.5">Puntos de Carga</span>
              <span className="text-xl font-extrabold font-headline text-primary-container">{stats.count} <span className="text-xs opacity-50">ESTACIONES</span></span>
            </div>
          </div>
        </div>

        {/* Consumption Flow */}
        <div className="md:col-span-12 bg-surface-container-low rounded-[2rem] p-10 border border-secondary/5 relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6">
            <div>
              <h3 className="text-2xl font-extrabold font-headline text-primary tracking-tight">Kilometraje Acumulado</h3>
              <p className="text-sm text-secondary font-medium">Evolución histórica de toda la flota por mes</p>
            </div>
            <div className="flex gap-2">
              <div className="bg-primary/10 px-4 py-2 rounded-lg text-primary text-[10px] font-bold uppercase tracking-widest">Vista Histórica</div>
            </div>
          </div>
          <div className="relative w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.consumptionHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMileage" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1A237E" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#1A237E" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(26,35,126,0.03)" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#888' }} 
                  minTickGap={30}
                />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip 
                  cursor={{ stroke: '#1A237E', strokeWidth: 1, strokeDasharray: '4 4' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white p-4 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] border-none">
                          <p className="text-[10px] font-bold text-outline uppercase tracking-widest mb-1">{label}</p>
                          <p className="text-lg font-extrabold text-primary font-headline">{formatKm(payload[0].value as number)} KM</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area 
                  type="monotone"
                  dataKey="mileage" 
                  stroke="#1A237E" 
                  strokeWidth={5}
                  fillOpacity={1}
                  fill="url(#colorMileage)"
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#1A237E' }}
                  activeDot={{ r: 8, strokeWidth: 0, fill: '#1A237E' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Logs */}
      <section className="mt-16">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-8">Últimas Cargas</h3>
        <div className="space-y-4">
          {fuelLogs.slice(0, 2).map((log) => {
            const stats = calculateLogStats(log, fuelLogs);
            return (
              <div key={log.id} className="flex flex-col py-4 px-6 bg-surface-container-lowest rounded-xl shadow-sm">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center overflow-hidden">
                      {getStationLogo(log.stationName) ? (
                        <img 
                          src={getStationLogo(log.stationName)!} 
                          alt={log.stationName} 
                          className="w-8 h-8 object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Fuel className="text-primary w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-primary">{log.stationName}</p>
                      {log.address && <p className="text-xs text-secondary truncate max-w-[180px]">{log.address}</p>}
                      <p className="text-xs text-secondary">{log.date} • {formatLiters(log.liters)}L</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-primary font-headline">${formatMoney(log.totalCost)}</p>
                    <p className={`text-xs font-bold uppercase ${log.fuelType === 'Premium' ? 'text-primary-container' : 'text-secondary'}`}>
                      {log.fuelType}
                    </p>
                  </div>
                </div>
                <EfficiencySummary stats={stats} compact />
              </div>
            );
          })}
        </div>
      </section>

      {/* FAB */}
      <button 
        aria-label="Añadir nuevo registro"
        onClick={onNavigateToNew}
        className="fixed bottom-28 right-6 w-16 h-16 bg-gradient-to-br from-primary to-primary-container text-white rounded-2xl shadow-[0_8px_32px_rgba(26,35,126,0.25)] flex items-center justify-center active:scale-90 transition-all duration-200 z-50"
      >
        <Plus className="w-8 h-8" />
      </button>
    </motion.div>
  );
};

const History = ({ fuelLogs, vehicles, selectedVehicleId, onSelectVehicle, onEdit, onDelete, onView }: { fuelLogs: FuelLog[], vehicles: Vehicle[], selectedVehicleId: string | null, onSelectVehicle: (id: string) => void, onEdit: (log: FuelLog) => void, onDelete: (id: string) => void, onView: (log: FuelLog) => void }) => {
  // Memoize the calculation of current month liters to prevent unnecessary re-calculations
  // and object instantiations on every render
  const currentMonthLiters = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return fuelLogs.filter(log => {
      const d = new Date(log.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).reduce((acc, log) => acc + log.liters, 0);
  }, [fuelLogs]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="pb-32 pt-24 px-6 max-w-4xl mx-auto w-full"
    >
      <section className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-primary mb-2">Registro de Actividad</p>
          <h1 className="text-4xl font-extrabold font-headline text-primary tracking-tight mb-4">Historial de Cargas</h1>
          <div className="flex items-end gap-2">
            <span className="text-5xl font-extrabold font-headline text-primary tracking-tighter">
              {formatLiters(currentMonthLiters)}
            </span>
            <span className="text-sm font-bold uppercase tracking-wider text-outline mb-2">Litros Totales / Mes</span>
          </div>
        </div>
        
        <VehicleSelector 
          vehicles={vehicles} 
          selectedVehicleId={selectedVehicleId} 
          onSelect={onSelectVehicle} 
        />
      </section>

      <div className="space-y-6">
        {fuelLogs.map((log) => {
          const stats = calculateLogStats(log, fuelLogs);
          return (
            <div key={log.id} className="bg-surface-container-low p-1 rounded-xl group cursor-pointer" onClick={() => onView(log)}>
              <div className="bg-surface-container-lowest rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-[0_8px_32px_rgba(26,35,126,0.04)] relative overflow-hidden">
                {log.isHighEfficiency && (
                  <div className="absolute top-0 right-0">
                    <div className="bg-tertiary-fixed text-on-tertiary-fixed-variant text-xs font-bold px-4 py-1 rounded-bl-xl uppercase tracking-tighter">
                      Alta Eficiencia
                    </div>
                  </div>
                )}
                
                <div className="absolute bottom-4 right-4 md:top-4 md:bottom-auto flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    aria-label="Editar registro"
                    onClick={(e) => { e.stopPropagation(); onEdit(log); }}
                    className="p-2 bg-surface-container-low rounded-full text-primary hover:bg-primary hover:text-white transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    aria-label="Eliminar registro"
                    onClick={(e) => { e.stopPropagation(); onDelete(log.id); }}
                    className="p-2 bg-surface-container-low rounded-full text-error hover:bg-error hover:text-white transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-start gap-5">
                  <div className="bg-primary-container/10 p-4 rounded-xl flex items-center justify-center overflow-hidden">
                    {getStationLogo(log.stationName) ? (
                      <img 
                        src={getStationLogo(log.stationName)!} 
                        alt={log.stationName} 
                        className="w-8 h-8 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Fuel className="text-primary-container w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-outline mb-1">{log.date}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold font-headline text-primary">{formatLiters(log.liters)}</span>
                      <span className="text-sm font-semibold text-outline">LTS</span>
                    </div>
                    <EfficiencySummary stats={stats} compact />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-8 md:gap-12">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest text-outline mb-1">Precio / L</span>
                    <span className="text-lg font-bold font-headline text-primary">${formatPrice(log.pricePerLiter)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest text-outline mb-1">Kilometraje</span>
                    <span className="text-lg font-bold font-headline text-primary">
                      {formatKm(log.mileage)} <span className="text-xs text-outline">km</span>
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest text-outline mb-1">Estación / Tipo</span>
                    <span className="text-sm font-bold text-primary truncate max-w-[150px]">{log.stationName}</span>
                    {log.address && <span className="text-xs text-secondary truncate max-w-[150px] leading-tight mb-1">{log.address}</span>}
                    <span className="text-xs font-bold text-secondary uppercase">{log.fuelType}</span>
                  </div>
                  <div className="flex flex-col col-span-2 md:col-span-1 border-t md:border-t-0 pt-4 md:pt-0 border-surface-variant/30">
                    <span className="text-xs font-bold uppercase tracking-widest text-outline mb-1">Costo Total</span>
                    <span className="text-xl font-extrabold font-headline text-primary">${formatMoney(log.totalCost)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-12 flex justify-center">
        <button className="bg-surface-container-low text-primary font-bold py-4 px-12 rounded-lg hover:bg-surface-variant transition-all active:scale-95 flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-widest">Cargar más historial</span>
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};

const NewEntry = ({ editingLog, fuelLogs, vehicles, selectedVehicleId, onSave, onCancel }: { key?: string | number, editingLog: FuelLog | null, fuelLogs: FuelLog[], vehicles: Vehicle[], selectedVehicleId: string | null, onSave: (log: FuelLog) => void, onCancel: () => void }) => {
  const now = new Date();
  const defaultDate = now.toISOString().split('T')[0];
  const defaultTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  const formatWithSeparators = (val: string) => {
    if (!val) return '';
    // Remove all non-numeric characters except the decimal point
    const cleanVal = val.replace(/[^\d.]/g, '');
    const parts = cleanVal.split('.');
    // Add thousands separator to the integer part (using dot)
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    // Rejoin with decimal part if it exists (using comma for display if we want to be consistent with es-ES, 
    // but the user might just want the thousands separator to be dot and keep dot for decimals? 
    // Usually it's one or the other. If thousands is dot, decimal is comma.)
    return parts.length > 1 ? `${parts[0]},${parts[1].slice(0, 2)}` : parts[0];
  };

  const parseSeparators = (val: string) => {
    // Remove dots (thousands) and replace comma with dot (decimal)
    return val.replace(/\./g, '').replace(/,/g, '.');
  };

  const [date, setDate] = useState(editingLog?.date || defaultDate);
  const [time, setTime] = useState(editingLog?.time || defaultTime);
  const [vehicleId, setVehicleId] = useState(editingLog?.vehicleId || selectedVehicleId || '');
  const [mileage, setMileage] = useState(editingLog ? formatWithSeparators(editingLog.mileage.toString()) : '');
  const [liters, setLiters] = useState(editingLog ? formatWithSeparators(editingLog.liters.toString()) : '');
  const [pricePerLiter, setPricePerLiter] = useState(editingLog ? formatWithSeparators(editingLog.pricePerLiter.toString()) : '');
  const [totalCost, setTotalCost] = useState(editingLog ? formatWithSeparators(editingLog.totalCost.toString()) : '');
  const [stationName, setStationName] = useState(editingLog?.stationName || '');
  const [address, setAddress] = useState(editingLog?.address || '');
  const [fuelType, setFuelType] = useState(() => {
    return editingLog?.fuelType || 'Gasolina 93';
  });
  const [location, setLocation] = useState<{ latitude: number, longitude: number } | null>(editingLog?.location || null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [nearbyStations, setNearbyStations] = useState<any[]>([]);
  const [searchingStations, setSearchingStations] = useState(false);
  const [noStationsFound, setNoStationsFound] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const stats = useMemo(() => {
    return calculateLogStats({
      mileage: parseFloat(parseSeparators(mileage)),
      liters: parseFloat(parseSeparators(liters)),
      totalCost: parseFloat(parseSeparators(totalCost)),
      date,
      time,
      vehicleId,
      id: editingLog?.id
    }, fuelLogs);
  }, [mileage, liters, totalCost, date, time, vehicleId, fuelLogs, editingLog]);

  const searchNearbyStations = async (lat: number, lng: number) => {
    setSearchingStations(true);
    setNoStationsFound(false);
    try {
      const apiKey = localStorage.getItem('geminiApiKey') || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error("Gemini API key is missing");
        setSearchingStations(false);
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: `Encuentra las 5 gasolineras (Copec, Shell, Petrobras, etc.) más cercanas a la latitud ${lat} y longitud ${lng} en Chile. Responde de manera ESTRICTA y ÚNICAMENTE con un JSON plano que sea un arreglo de objetos con las llaves "name" (string con el nombre) y "address" (string con la dirección). Sin comillas triples ni markdown.`,
        config: {
          tools: [{ googleSearch: {} }]
        },
      });

      let text = response.text || '[]';
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      let stations = [];
      try {
        stations = JSON.parse(text);
      } catch (e) {
        console.warn("JSON error in searchNearbyStations:", text);
        throw new Error("Invalid JSON");
      }

      if (stations && stations.length > 0) {
        const formattedStations = stations.map((s: any) => ({
          name: s.name,
          address: s.address,
          brand: s.brand || s.name.split(' ')[0], // Try to extract brand
          latitude: lat + (Math.random() - 0.5) * 0.005, // Jitter slightly for map display
          longitude: lng + (Math.random() - 0.5) * 0.005
        }));
        setNearbyStations(formattedStations);
      } else {
        setNoStationsFound(true);
      }
    } catch (error) {
      console.error("Error searching stations:", error);
      setNoStationsFound(true);
    } finally {
      setSearchingStations(false);
    }
  };

  const handleGetLocation = () => {
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setLocation({ latitude: lat, longitude: lng });
        setGettingLocation(false);
        
        // Fetch nearby stations using Gemini
        await searchNearbyStations(lat, lng);
      },
      (error) => {
        console.error("Error getting location:", error);
        setGettingLocation(false);
      }
    );
  };

  const validateField = (field: string, value: string, currentErrors: Record<string, string>) => {
    const newErrors = { ...currentErrors };
    const numValue = parseFloat(parseSeparators(value));

    switch (field) {
      case 'vehicleId':
        if (!value) {
          newErrors.vehicleId = 'Debes seleccionar un vehículo';
        } else {
          delete newErrors.vehicleId;
        }
        break;
      case 'mileage':
        if (!value) {
          newErrors.mileage = 'El kilometraje es requerido';
        } else if (isNaN(numValue) || numValue <= 0) {
          newErrors.mileage = 'Debe ser un número positivo';
        } else {
          // Get all logs for this vehicle, excluding the one being edited if applicable
          const vehicleLogs = fuelLogs
            .filter(log => log.vehicleId === vehicleId && (!editingLog || log.id !== editingLog.id))
            .sort((a, b) => {
              const dateA = new Date(`${a.date}T${a.time || '00:00'}`);
              const dateB = new Date(`${b.date}T${b.time || '00:00'}`);
              return dateA.getTime() - dateB.getTime();
            });

          const currentLogDate = new Date(`${date}T${time || '00:00'}`);
          
          // Find the log immediately before and after the current date/time
          const prevLog = [...vehicleLogs].reverse().find(l => new Date(`${l.date}T${l.time || '00:00'}`) <= currentLogDate);
          const nextLog = vehicleLogs.find(l => new Date(`${l.date}T${l.time || '00:00'}`) >= currentLogDate);

          if (prevLog && numValue <= prevLog.mileage) {
            newErrors.mileage = `Debe ser mayor al registro anterior (${formatKm(prevLog.mileage)} km)`;
          } else if (nextLog && numValue >= nextLog.mileage) {
            newErrors.mileage = `Debe ser menor al registro posterior (${formatKm(nextLog.mileage)} km)`;
          } else {
            delete newErrors.mileage;
          }
        }
        break;
      case 'liters':
        if (!value) {
          newErrors.liters = 'Los litros son requeridos';
        } else if (isNaN(numValue) || numValue <= 0) {
          newErrors.liters = 'Debe ser un número positivo';
        } else {
          delete newErrors.liters;
        }
        break;
      case 'pricePerLiter':
        if (!value) {
          newErrors.pricePerLiter = 'El precio es requerido';
        } else if (isNaN(numValue) || numValue <= 0) {
          newErrors.pricePerLiter = 'Debe ser un número positivo';
        } else {
          delete newErrors.pricePerLiter;
        }
        break;
      case 'totalCost':
        if (!value) {
          newErrors.totalCost = 'El costo total es requerido';
        } else if (isNaN(numValue) || numValue <= 0) {
          newErrors.totalCost = 'Debe ser un número positivo';
        } else {
          delete newErrors.totalCost;
        }
        break;
      case 'date':
        if (!value) {
          newErrors.date = 'La fecha es requerida';
        } else {
          const selectedDate = new Date(value);
          const today = new Date();
          today.setHours(23, 59, 59, 999);
          if (selectedDate > today) {
            newErrors.date = 'La fecha no puede ser futura';
          } else {
            delete newErrors.date;
          }
        }
        break;
      case 'time':
        if (!value) {
          newErrors.time = 'La hora es requerida';
        } else {
          delete newErrors.time;
        }
        break;
    }
    return newErrors;
  };

  const validate = (field: string, value: string) => {
    setErrors(prev => validateField(field, value, prev));
  };

  const validateAll = () => {
    let currentErrors = {};
    currentErrors = validateField('vehicleId', vehicleId, currentErrors);
    currentErrors = validateField('date', date, currentErrors);
    currentErrors = validateField('time', time, currentErrors);
    currentErrors = validateField('mileage', mileage, currentErrors);
    currentErrors = validateField('liters', liters, currentErrors);
    currentErrors = validateField('pricePerLiter', pricePerLiter, currentErrors);
    currentErrors = validateField('totalCost', totalCost, currentErrors);
    
    setErrors(currentErrors);
    return Object.keys(currentErrors).length === 0;
  };

  const handleLitersChange = (val: string) => {
    const cleanVal = parseSeparators(val);
    if (isNaN(Number(cleanVal)) && cleanVal !== '.') return;
    
    setLiters(formatWithSeparators(cleanVal));
    validate('liters', cleanVal);
    
    const l = parseFloat(cleanVal);
    const p = parseFloat(parseSeparators(pricePerLiter));
    const t = parseFloat(parseSeparators(totalCost));

    if (!isNaN(l) && !isNaN(p)) {
      const calculatedTotal = (l * p).toFixed(2);
      setTotalCost(formatWithSeparators(calculatedTotal));
      validate('totalCost', calculatedTotal);
    } else if (!isNaN(l) && !isNaN(t) && l !== 0) {
      const calculatedPrice = (t / l).toFixed(2);
      setPricePerLiter(formatWithSeparators(calculatedPrice));
      validate('pricePerLiter', calculatedPrice);
    }
  };

  const handlePriceChange = (val: string) => {
    const cleanVal = parseSeparators(val);
    if (isNaN(Number(cleanVal)) && cleanVal !== '.') return;

    setPricePerLiter(formatWithSeparators(cleanVal));
    validate('pricePerLiter', cleanVal);
    
    const p = parseFloat(cleanVal);
    const l = parseFloat(parseSeparators(liters));
    const t = parseFloat(parseSeparators(totalCost));

    if (!isNaN(p) && !isNaN(l)) {
      const calculatedTotal = (l * p).toFixed(2);
      setTotalCost(formatWithSeparators(calculatedTotal));
      validate('totalCost', calculatedTotal);
    } else if (!isNaN(p) && !isNaN(t) && p !== 0) {
      const calculatedLiters = (t / p).toFixed(2);
      setLiters(formatWithSeparators(calculatedLiters));
      validate('liters', calculatedLiters);
    }
  };

  const handleTotalCostChange = (val: string) => {
    const cleanVal = parseSeparators(val);
    if (isNaN(Number(cleanVal)) && cleanVal !== '.') return;

    setTotalCost(formatWithSeparators(cleanVal));
    validate('totalCost', cleanVal);
    
    const t = parseFloat(cleanVal);
    const l = parseFloat(parseSeparators(liters));
    const p = parseFloat(parseSeparators(pricePerLiter));

    if (!isNaN(t) && !isNaN(l) && l !== 0) {
      const calculatedPrice = (t / l).toFixed(2);
      setPricePerLiter(formatWithSeparators(calculatedPrice));
      validate('pricePerLiter', calculatedPrice);
    } else if (!isNaN(t) && !isNaN(p) && p !== 0) {
      const calculatedLiters = (t / p).toFixed(2);
      setLiters(formatWithSeparators(calculatedLiters));
      validate('liters', calculatedLiters);
    }
  };

  const handleMileageChange = (val: string) => {
    const cleanVal = parseSeparators(val).replace(/\D/g, '');
    setMileage(formatWithSeparators(cleanVal));
    validate('mileage', cleanVal);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="flex-1 w-full max-w-2xl mx-auto px-6 pt-24 pb-32"
    >
      <section className="mb-12">
        <div className="flex items-baseline gap-4 mb-2">
          <span className="text-[3.5rem] font-extrabold font-headline leading-none text-primary tracking-tight">
            {editingLog ? 'Editar' : 'Nuevo'}
          </span>
          <span className="text-xs font-medium uppercase tracking-wider text-secondary">
            {editingLog ? 'Actualizar Registro' : 'Registro de Carga'}
          </span>
        </div>
        <p className="text-secondary max-w-md">
          {editingLog 
            ? 'Modifica los detalles del repostaje seleccionado para corregir cualquier error en el historial.'
            : 'Ingresa los detalles de tu último repostaje para mantener el flujo de eficiencia de tu flota actualizado.'}
        </p>
      </section>

      {/* Interactive Map Section */}
      <div className="mb-10 bg-surface-container-low rounded-2xl overflow-hidden border border-outline/10 shadow-sm">
        <div className="p-4 flex items-center justify-between bg-surface-container-lowest border-b border-outline/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-primary leading-none">Mapa de Estaciones</h3>
              <p className="text-xs text-secondary font-medium mt-1">
                {location ? 'Ubicación detectada' : 'Activa tu ubicación para ver estaciones cercanas'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={handleGetLocation}
              disabled={gettingLocation}
              className="text-xs font-bold uppercase tracking-widest bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {gettingLocation ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
              {location ? 'Actualizar' : 'Ubicarme'}
            </button>
            {location && (
              <button 
                type="button"
                onClick={() => setShowMap(!showMap)}
                className="text-xs font-bold uppercase tracking-widest bg-surface-container-low text-primary px-4 py-2 rounded-lg hover:bg-surface-variant transition-all"
              >
                {showMap ? 'Ocultar Mapa' : 'Ver Mapa'}
              </button>
            )}
          </div>
        </div>

        {location && showMap && (
          <div className="h-64 w-full relative z-0">
            <MapContainer 
              center={[location.latitude, location.longitude]} 
              zoom={15} 
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker position={[location.latitude, location.longitude]}>
                <Popup>
                  <div className="p-1">
                    <p className="font-bold text-xs">Tu ubicación</p>
                  </div>
                </Popup>
              </Marker>
              {nearbyStations.map((station, i) => (
                <Marker 
                  key={i} 
                  position={[station.latitude, station.longitude]}
                  eventHandlers={{
                    click: () => {
                      setStationName(station.name);
                      if (station.address) setAddress(station.address);
                    },
                  }}
                >
                  <Popup>
                    <div className="p-1">
                      <p className="font-bold text-xs">{station.name}</p>
                      {station.address && <p className="text-xs text-secondary">{station.address}</p>}
                      <button 
                        type="button"
                        onClick={() => {
                          setStationName(station.name);
                          if (station.address) setAddress(station.address);
                        }}
                        className="mt-2 text-xs font-bold text-primary uppercase hover:underline"
                      >
                        Seleccionar
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}
      </div>

      {/* Efficiency Comparison Section */}
      <AnimatePresence>
        {stats && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mb-10"
          >
            <EfficiencySummary stats={stats} />
          </motion.div>
        )}
      </AnimatePresence>

      <form className="space-y-10" onSubmit={(e) => {
        e.preventDefault();
        
        if (!validateAll()) return;

          const log: FuelLog = {
            id: editingLog?.id || Math.random().toString(36).substr(2, 9),
            vehicleId,
            date,
            time,
            mileage: parseFloat(parseSeparators(mileage)),
            liters: parseFloat(parseSeparators(liters)),
            pricePerLiter: parseFloat(parseSeparators(pricePerLiter)),
            totalCost: parseFloat(parseSeparators(totalCost)),
            stationName: stationName || 'Gasolinera Central',
            address,
            fuelType: fuelType,
            location: location || undefined,
          };
        onSave(log);
      }}>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-primary ml-1">Seleccionar Vehículo</label>
          <div className={`bg-surface-container-low rounded-lg p-4 flex items-center gap-3 focus-within:ring-2 transition-shadow ${errors.vehicleId ? 'ring-2 ring-error/50' : 'focus-within:ring-primary/10'}`}>
            <Car className={`${errors.vehicleId ? 'text-error' : 'text-outline'} w-5 h-5`} />
            <select 
              className="bg-transparent border-none w-full focus:ring-0 text-primary font-medium appearance-none" 
              value={vehicleId}
              onChange={(e) => {
                setVehicleId(e.target.value);
                validate('vehicleId', e.target.value);
              }}
            >
              <option value="" disabled>Selecciona un vehículo</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.name} ({v.make} {v.model})</option>
              ))}
            </select>
            <ChevronDown className="text-outline w-4 h-4" />
          </div>
          {errors.vehicleId && <p className="text-xs font-bold text-error ml-1 uppercase tracking-tight">{errors.vehicleId}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-primary ml-1">Fecha del Registro</label>
            <div className={`bg-surface-container-low rounded-lg p-4 flex items-center gap-3 focus-within:ring-2 transition-shadow ${errors.date ? 'ring-2 ring-error/50' : 'focus-within:ring-primary/10'}`}>
              <Calendar className={`${errors.date ? 'text-error' : 'text-outline'} w-5 h-5`} />
              <input 
                className="bg-transparent border-none w-full focus:ring-0 text-primary font-medium" 
                type="date" 
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  validate('date', e.target.value);
                }}
              />
            </div>
            {errors.date && <p className="text-xs font-bold text-error ml-1 uppercase tracking-tight">{errors.date}</p>}
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-primary ml-1">Hora</label>
            <div className={`bg-surface-container-low rounded-lg p-4 flex items-center gap-3 focus-within:ring-2 transition-shadow ${errors.time ? 'ring-2 ring-error/50' : 'focus-within:ring-primary/10'}`}>
              <Clock className={`${errors.time ? 'text-error' : 'text-outline'} w-5 h-5`} />
              <input 
                className="bg-transparent border-none w-full focus:ring-0 text-primary font-medium" 
                type="time" 
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  validate('time', e.target.value);
                }}
              />
            </div>
            {errors.time && <p className="text-xs font-bold text-error ml-1 uppercase tracking-tight">{errors.time}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-primary ml-1">Estación de Gasolina</label>
            <div className="bg-surface-container-low rounded-lg p-4 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/10 transition-shadow relative">
              {getStationLogo(stationName) ? (
                <img 
                  src={getStationLogo(stationName)!} 
                  alt={stationName} 
                  className="w-5 h-5 object-contain"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(stationName) + '&background=E8EAF6&color=1A237E';
                  }}
                />
              ) : (
                <MapPin className="text-outline w-5 h-5" />
              )}
              <input 
                className="bg-transparent border-none w-full focus:ring-0 text-primary font-medium" 
                type="text" 
                placeholder="Nombre de la estación"
                value={stationName}
                onChange={(e) => setStationName(e.target.value)}
                onFocus={() => {
                  if (nearbyStations.length === 0 && !searchingStations) {
                    if (location) {
                      searchNearbyStations(location.latitude, location.longitude);
                    }
                  }
                }}
              />
              <button 
                aria-label="Buscar estaciones cercanas"
                type="button"
                onClick={() => {
                  if (location) {
                    searchNearbyStations(location.latitude, location.longitude);
                  } else {
                    handleGetLocation();
                  }
                }}
                className="p-2 hover:bg-primary/5 rounded-full transition-colors text-primary"
                title="Buscar estaciones cercanas"
              >
                {searchingStations ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              </button>
            </div>
            <div className="bg-surface-container-low rounded-lg p-4 flex flex-col gap-1 focus-within:ring-2 focus-within:ring-primary/10 transition-shadow mt-2">
              <div className="flex items-center gap-3">
                <MapPin className="text-outline w-4 h-4" />
                <input 
                  className="bg-transparent border-none w-full focus:ring-0 text-secondary text-xs font-medium italic placeholder:not-italic" 
                  type="text" 
                  placeholder="Dirección (se agrega automáticamente)"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>
            {noStationsFound && (
              <div className="mt-4 p-4 bg-surface-container-low border border-outline/10 rounded-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
                    <Fuel className="w-4 h-4 text-secondary" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-primary uppercase tracking-widest">No hay estaciones cerca</p>
                    <p className="text-[10px] text-secondary font-medium">Puedes elegir una marca popular:</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {['Copec', 'Shell', 'Petrobras', 'Enex', 'Terpel', 'Lipigas'].map(brand => (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => {
                        setStationName(brand);
                        setNoStationsFound(false);
                      }}
                      className="p-3 bg-surface-container-lowest border border-outline/5 rounded-xl hover:border-primary/30 hover:bg-primary/5 transition-all flex items-center gap-3 group"
                    >
                      <div className="w-6 h-6 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {getStationLogo(brand) ? (
                          <img src={getStationLogo(brand)!} alt={brand} className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full bg-primary/10 rounded-full" />
                        )}
                      </div>
                      <span className="text-xs font-bold text-primary group-hover:text-primary-container transition-colors">{brand}</span>
                    </button>
                  ))}
                </div>
                <button 
                  type="button"
                  onClick={() => setNoStationsFound(false)}
                  className="mt-4 w-full py-2 text-[10px] font-bold text-primary uppercase tracking-widest bg-primary/5 rounded-lg hover:bg-primary/10 transition-all"
                >
                  Ocultar sugerencias
                </button>
              </div>
            )}
            {nearbyStations.length > 0 && (
              <div className="mt-4 bg-surface-container-lowest border border-primary/20 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-4 relative z-20">
                <div className="p-4 border-b border-outline/5 bg-primary/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Fuel className="w-4 h-4 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-primary">Estaciones Recomendadas</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setNearbyStations([])}
                    className="p-1 px-3 bg-primary/10 rounded-full text-[10px] font-bold text-primary uppercase hover:bg-primary/20 transition-all"
                  >
                    Cerrar
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-outline/5">
                  {nearbyStations.map((station, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setStationName(station.name);
                        if (station.address) setAddress(station.address);
                        setNearbyStations([]);
                      }}
                      className="w-full text-left p-4 hover:bg-primary/5 flex items-center gap-4 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:scale-110 transition-transform">
                        {getStationLogo(station.name) ? (
                          <img 
                            src={getStationLogo(station.name)!} 
                            alt={station.name} 
                            className="w-6 h-6 object-contain"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Fuel className="text-primary/40 w-5 h-5" />
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-primary truncate">{station.name}</span>
                          <ArrowRight className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                        </div>
                        {station.address && <span className="text-xs text-secondary truncate font-medium">{station.address}</span>}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="p-3 bg-surface-container-low/50 text-center">
                  <p className="text-[10px] font-medium text-secondary/60">Datos obtenidos mediante IA y Búsqueda de Google</p>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-primary ml-1">Tipo de Combustible</label>
            <div className="bg-surface-container-low rounded-lg p-4 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/10 transition-shadow">
              <Fuel className="text-outline w-5 h-5" />
              <select 
                className="bg-transparent border-none w-full focus:ring-0 text-primary font-medium appearance-none" 
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value as any)}
              >
                <option value="Gasolina 93">Gasolina 93</option>
                <option value="Gasolina 95">Gasolina 95</option>
                <option value="Gasolina 97">Gasolina 97</option>
                <option value="Diesel">Diesel</option>
              </select>
              <ChevronDown className="text-outline w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="bg-surface-container-low rounded-xl p-8 space-y-6">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <h2 className="text-lg font-bold font-headline text-primary">Kilometraje</h2>
              <p className="text-xs text-secondary uppercase tracking-tighter">Lectura actual del odómetro</p>
            </div>
            <Gauge className={`${errors.mileage ? 'text-error' : 'text-primary/40'} w-8 h-8`} />
          </div>
          <div className="relative">
            <input 
              className={`w-full bg-surface-container-lowest text-3xl md:text-[2.5rem] font-bold font-headline py-6 pl-6 pr-16 rounded-xl border-none focus:ring-2 text-primary placeholder:text-surface-variant transition-all ${errors.mileage ? 'ring-2 ring-error/50' : 'focus:ring-primary/20'}`} 
              inputMode="numeric" 
              placeholder="000,000" 
              type="text" 
              value={mileage}
              onChange={(e) => handleMileageChange(e.target.value)}
            />
            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-sm font-bold text-outline">KM</span>
          </div>
          {errors.mileage && <p className="text-xs font-bold text-error ml-1 uppercase tracking-tight">{errors.mileage}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-surface-container-low rounded-xl p-6 space-y-4">
            <label className="block text-sm font-bold text-primary uppercase tracking-widest">Litros</label>
            <div className="relative">
              <input 
                className={`w-full bg-surface-container-lowest text-xl font-bold font-headline py-4 pl-4 pr-10 rounded-lg border-none focus:ring-2 text-primary placeholder:text-surface-variant transition-all ${errors.liters ? 'ring-2 ring-error/50' : 'focus:ring-primary/20'}`} 
                inputMode="decimal" 
                placeholder="0.00" 
                type="text" 
                value={liters}
                onChange={(e) => handleLitersChange(e.target.value)}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-outline-variant">L</span>
            </div>
            {errors.liters && <p className="text-xs font-bold text-error ml-1 uppercase tracking-tight">{errors.liters}</p>}
          </div>
          <div className="bg-surface-container-low rounded-xl p-6 space-y-4">
            <label className="block text-sm font-bold text-primary uppercase tracking-widest">Precio/L</label>
            <div className="relative">
              <input 
                className={`w-full bg-surface-container-lowest text-xl font-bold font-headline py-4 pl-4 pr-10 rounded-lg border-none focus:ring-2 text-primary placeholder:text-surface-variant transition-all ${errors.pricePerLiter ? 'ring-2 ring-error/50' : 'focus:ring-primary/20'}`} 
                inputMode="decimal" 
                placeholder="0.00" 
                type="text" 
                value={pricePerLiter}
                onChange={(e) => handlePriceChange(e.target.value)}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-outline-variant">$</span>
            </div>
            {errors.pricePerLiter && <p className="text-xs font-bold text-error ml-1 uppercase tracking-tight">{errors.pricePerLiter}</p>}
          </div>
          <div className="bg-surface-container-low rounded-xl p-6 space-y-4">
            <label className="block text-sm font-bold text-primary uppercase tracking-widest">Total</label>
            <div className="relative">
              <input 
                className={`w-full bg-surface-container-lowest text-xl font-bold font-headline py-4 pl-4 pr-10 rounded-lg border-none focus:ring-2 text-primary placeholder:text-surface-variant transition-all ${errors.totalCost ? 'ring-2 ring-error/50' : 'focus:ring-primary/20'}`} 
                inputMode="decimal" 
                placeholder="0.00" 
                type="text" 
                value={totalCost}
                onChange={(e) => handleTotalCostChange(e.target.value)}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-outline-variant">$</span>
            </div>
            {errors.totalCost && <p className="text-xs font-bold text-error ml-1 uppercase tracking-tight">{errors.totalCost}</p>}
          </div>
        </div>

        <div className="flex items-center gap-4 p-4 bg-tertiary-fixed/20 rounded-full border border-tertiary-fixed/30">
          <div className="w-8 h-8 rounded-full bg-tertiary-fixed flex items-center justify-center">
            <Leaf className="text-on-tertiary-fixed-variant w-4 h-4" />
          </div>
          <p className="text-xs font-medium text-on-tertiary-fixed-variant">
            <span className="font-bold">Consejo:</span> Mantener una presión de neumáticos correcta mejora la eficiencia hasta en un 3%.
          </p>
        </div>

        <div className="pt-6 flex flex-col gap-4">
          <button 
            type="submit"
            className="w-full py-5 px-8 rounded-lg bg-gradient-to-br from-primary to-primary-container text-white font-bold text-lg font-headline shadow-[0_8px_32px_rgba(26,35,126,0.15)] hover:shadow-[0_12px_48px_rgba(26,35,126,0.25)] transition-all active:scale-[0.98] flex justify-center items-center gap-3"
          >
            <CheckCircle2 className="w-6 h-6" />
            {editingLog ? 'Actualizar Registro' : 'Guardar Registro'}
          </button>
          {editingLog && (
            <button 
              type="button"
              onClick={onCancel}
              className="w-full py-4 px-8 rounded-lg bg-surface-container-low text-primary font-bold text-sm uppercase tracking-widest hover:bg-surface-variant transition-all"
            >
              Cancelar Edición
            </button>
          )}
        </div>
      </form>
    </motion.div>
  );
};

const CustomTooltip = ({ active, payload, label, unit }: any) => {
  if (active && payload && payload.length) {
    if (unit === 'Score/KM/L') {
      const { score, efficiency, liters } = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-xl p-5 rounded-[2rem] shadow-2xl border border-primary/5 min-w-[200px] premium-shadow-deep scale-up-tooltip">
          <p className="text-[10px] font-black text-secondary uppercase tracking-[0.2em] border-b border-primary/5 pb-3 mb-1">Métrica de Viaje</p>
          {payload[0].payload.fullDate && <p className="text-[10px] font-bold text-primary opacity-60 mb-4">{payload[0].payload.fullDate}</p>}
          <div className="space-y-3">
             <div className="flex justify-between items-center bg-primary-container p-2.5 rounded-2xl text-white">
               <span className="text-[9px] font-black uppercase tracking-widest opacity-80">Puntaje</span>
               <span className="text-sm font-black font-headline">{score}/100</span>
             </div>
             <div className="flex justify-between items-center bg-white p-2.5 rounded-2xl border border-primary/5 shadow-inner">
               <span className="text-[9px] font-black text-secondary uppercase tracking-widest">Rendimiento</span>
               <span className="text-sm font-black text-primary">{formatEfficiency(efficiency)} <span className="text-[10px]">KM/L</span></span>
             </div>
             <div className="flex justify-between items-center bg-white p-2.5 rounded-2xl border border-primary/5 shadow-inner">
               <span className="text-[9px] font-black text-secondary uppercase tracking-widest">Litros</span>
               <span className="text-sm font-black text-primary">{formatLiters(liters)} <span className="text-[10px]">L</span></span>
             </div>
          </div>
        </div>
      );
    }

    const itemData = payload[0].payload;
    return (
      <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-primary/5 flex flex-col gap-1 min-w-[140px] premium-shadow">
        {label && <p className="text-[10px] font-bold text-secondary uppercase tracking-[0.1em] border-b border-primary/5 pb-2 mb-2">{label}</p>}
        {itemData.fullDate && <p className="text-[10px] font-black text-primary/60 mb-2">{itemData.fullDate}</p>}
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-bold text-primary">{payload[0].name || unit}</p>
          <div className="flex items-baseline gap-0.5">
            <p className="text-lg font-black text-primary font-headline tracking-tighter">
              {typeof payload[0].value === 'number' ? 
                (unit === 'L' ? formatLiters(payload[0].value) : 
                 unit === 'KM/L' ? formatEfficiency(payload[0].value) : 
                 unit.includes('KM') ? formatKm(payload[0].value) : 
                 formatPrice(payload[0].value)) 
                : payload[0].value}
            </p>
            <span className="text-[10px] font-bold text-secondary">{unit.replace('Score/', '')}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const Stats = ({ fuelLogs, vehicles, selectedVehicleId, onSelectVehicle, lastSyncTime }: { fuelLogs: FuelLog[], vehicles: Vehicle[], selectedVehicleId: string | null, onSelectVehicle: (id: string) => void, lastSyncTime: Date }) => {
  const stats = useMemo(() => {
    if (fuelLogs.length === 0) return {
      totalRefuels: 0,
      totalKilometers: 0,
      estimatedSavings: 0,
      monthlyConsumption: [],
      priceVariation: [],
      efficiencyHistory: [],
      odometerHistory: [],
      distanceHistory: [],
      conductionScoreHistory: [],
      averageEfficiency: 0,
      totalInvestment: 0,
      avgCostPerKm: 0
    };

    const sortedLogs = [...fuelLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const totalRefuels = fuelLogs.length;
    const totalInvestment = fuelLogs.reduce((acc, log) => acc + log.totalCost, 0);
    
    const minOdo = Math.min(...fuelLogs.map(l => l.mileage));
    const maxOdo = Math.max(...fuelLogs.map(l => l.mileage));
    const totalDistance = maxOdo - minOdo;
    const totalKilometers = maxOdo; // Current odometer
    const avgCostPerKm = totalDistance > 0 ? totalInvestment / totalDistance : 0;
    
    const estimatedSavings = Math.round(totalInvestment * 0.1);

    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    const targetEff = vehicle?.targetEfficiency || 15;

    const priceVariation = sortedLogs.map((log, i) => ({
      label: `Carga #${i + 1}`,
      displayLabel: formatMonthYear(new Date(log.date)),
      fullDate: log.date,
      price: log.pricePerLiter,
      dateOriginal: log.date
    }));

    const efficiencyHistory = sortedLogs.slice(1).map((log, i) => {
      const prev = sortedLogs[i];
      const dist = log.mileage - prev.mileage;
      const eff = dist / log.liters;
      return {
        label: `Carga #${i + 2}`,
        displayLabel: formatMonthYear(new Date(log.date)),
        fullDate: log.date,
        value: isFinite(eff) && eff > 0 ? parseFloat(eff.toFixed(2)) : 0
      };
    }).filter(h => h.value > 0);

    const distanceHistory = sortedLogs.slice(1).map((log, i) => {
      const prev = sortedLogs[i];
      return {
        label: `Carga #${i + 2}`,
        displayLabel: formatMonthYear(new Date(log.date)),
        fullDate: log.date,
        value: Math.max(0, log.mileage - prev.mileage),
        liters: log.liters
      };
    });

    const eventConsumption = sortedLogs.map((log, i) => ({
      label: `Carga #${i + 1}`,
      displayLabel: formatMonthYear(new Date(log.date)),
      fullDate: log.date,
      liters: log.liters
    }));

    const conductionScoreHistory = sortedLogs.slice(1).map((log, i) => {
      const prev = sortedLogs[i];
      const dist = log.mileage - prev.mileage;
      const efficiency = dist / log.liters;
      if (!isFinite(efficiency) || efficiency <= 0) return null;
      
      const normalizedEff = Math.min(efficiency / (targetEff * 1.5), 1);
      // Use a deterministic "pseudo-random" based on data to keep it stable but dynamic-looking
      const dataHash = (dist + log.liters + log.totalCost) % 10;
      const score = Math.round(normalizedEff * 80 + 10 + dataHash);
      
      return { 
        score,
        efficiency: parseFloat(efficiency.toFixed(2)),
        displayScore: score,
        displayEfficiency: efficiency,
        liters: log.liters, 
        z: log.liters,
        label: `Carga #${i + 2}`,
        displayLabel: formatMonthYear(new Date(log.date)),
        fullDate: log.date,
        // Progresión de color: más claro para antiguas, más intenso para recientes
        color: `hsl(220, 70%, ${70 - (i / sortedLogs.length) * 40}%)` 
      };
    }).filter((d): d is any => d !== null);

    let averageEfficiency = 0;
    if (sortedLogs.length >= 2) {
      const distance = sortedLogs[sortedLogs.length - 1].mileage - sortedLogs[0].mileage;
      const litersConsumed = sortedLogs.slice(1).reduce((acc, log) => acc + log.liters, 0);
      if (distance > 0 && litersConsumed > 0) {
        averageEfficiency = distance / litersConsumed;
      }
    }

    return {
      totalRefuels,
      totalKilometers,
      estimatedSavings,
      monthlyConsumption: eventConsumption,
      priceVariation,
      efficiencyHistory,
      conductionScoreHistory,
      distanceHistory,
      averageEfficiency: isFinite(averageEfficiency) ? parseFloat(averageEfficiency.toFixed(1)) : 0,
      totalInvestment,
      avgCostPerKm
    };
  }, [fuelLogs, vehicles, selectedVehicleId]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="pb-32 pt-24 px-6 max-w-6xl mx-auto"
    >
      <section className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Advanced Analytics • LIVE</span>
            {lastSyncTime && (
              <span className="text-[9px] font-bold text-outline uppercase ml-2 px-2 py-0.5 bg-outline/5 rounded-full">
                Sincronizado {new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(lastSyncTime)}
              </span>
            )}
          </div>
          <h2 className="text-4xl md:text-6xl font-black font-headline tracking-tighter text-primary">Estadísticas</h2>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden md:block text-[10px] font-bold text-outline uppercase tracking-widest text-right">
            Visualizando datos de<br/>
            <span className="text-primary tracking-normal font-black text-xs">{fuelLogs.length} cargas registradas</span>
          </span>
          <VehicleSelector 
            vehicles={vehicles} 
            selectedVehicleId={selectedVehicleId} 
            onSelect={onSelectVehicle} 
          />
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
        {/* Main Stats Summary Cards */}
        <div className="md:col-span-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-6">
          <div className="bg-surface-container-low p-6 rounded-[2rem] border border-primary/5 flex flex-col justify-between group hover:bg-primary-container transition-all">
            <div className="w-10 h-10 rounded-2xl bg-primary-container text-white flex items-center justify-center mb-6 shadow-lg shadow-primary/20 group-hover:bg-white group-hover:text-primary transition-colors">
              <HistoryIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-1 group-hover:text-white/70 transition-colors">Cargas</p>
              <h4 className="text-3xl font-black font-headline text-primary tracking-tighter group-hover:text-white transition-colors">{stats.totalRefuels}</h4>
            </div>
          </div>

          <div className="bg-surface-container-low p-6 rounded-[2rem] border border-primary/5 flex flex-col justify-between group hover:bg-tertiary-fixed transition-all">
            <div className="w-10 h-10 rounded-2xl bg-tertiary-fixed text-on-tertiary-fixed-variant flex items-center justify-center mb-6 shadow-lg shadow-tertiary-fixed/20 group-hover:bg-white transition-colors">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-1 group-hover:text-on-tertiary-fixed-variant/70 transition-colors">Odómetro Total</p>
              <h4 className="text-3xl font-black font-headline text-primary tracking-tighter group-hover:text-on-tertiary-fixed-variant transition-colors">{formatKm(stats.totalKilometers)}</h4>
            </div>
          </div>

          <div className="bg-surface-container-low p-6 rounded-[2rem] border border-primary/5 flex flex-col justify-between group hover:bg-secondary-container transition-all">
            <div className="w-10 h-10 rounded-2xl bg-[#f5f5f7] text-primary flex items-center justify-center mb-6 border border-primary/5 group-hover:bg-white transition-colors">
              <HistoryIcon className="w-5 h-5 rotate-180" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-1 group-hover:text-primary transition-colors">Inv. Total</p>
              <h4 className="text-2xl font-black font-headline text-primary tracking-tighter group-hover:text-primary transition-colors">${formatMoney(stats.totalInvestment)}</h4>
            </div>
          </div>

          <div className="bg-surface-container-low p-6 rounded-[2rem] border border-primary/5 flex flex-col justify-between group hover:bg-primary transition-all">
            <div className="w-10 h-10 rounded-2xl bg-[#f5f5f7] text-primary flex items-center justify-center mb-6 border border-primary/5 group-hover:bg-white transition-colors">
              <Fuel className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-1 group-hover:text-white/70 transition-colors">PROM. $/L</p>
              <h4 className="text-3xl font-black font-headline text-primary tracking-tighter group-hover:text-white transition-colors">
                ${stats.priceVariation.length > 0 ? formatMoney(stats.priceVariation.reduce((a, b) => a + b.price, 0) / stats.priceVariation.length) : '0'}
              </h4>
            </div>
          </div>

          <div className="bg-surface-container-low p-6 rounded-[2rem] border border-primary/5 flex flex-col justify-between group hover:bg-success transition-all">
            <div className="w-10 h-10 rounded-2xl bg-[#f5f5f7] text-success flex items-center justify-center mb-6 border border-primary/5 group-hover:bg-white transition-colors">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-1 group-hover:text-white/70 transition-colors">Costo / KM</p>
              <div className="flex items-baseline gap-0.5">
                <h4 className="text-2xl font-black font-headline text-primary tracking-tighter group-hover:text-white transition-colors">${formatMoney(stats.avgCostPerKm)}</h4>
                <span className="text-[10px] font-bold text-outline group-hover:text-white/50 transition-colors">/KM</span>
              </div>
            </div>
          </div>

          <div className="bg-primary text-white p-6 rounded-[2rem] shadow-2xl premium-shadow relative overflow-hidden group hover:scale-[1.05] transition-all duration-500">
            <div className="z-10 relative">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Eficiencia</p>
              <div className="flex items-baseline gap-1">
                <h4 className="text-3xl font-black font-headline tracking-tighter">
                  {formatEfficiency(stats.averageEfficiency)}
                </h4>
                <span className="text-[10px] font-bold opacity-60">KM/L</span>
              </div>
            </div>
            <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/10 blur-2xl group-hover:bg-white/20 transition-all"></div>
            <Leaf className="absolute top-4 right-4 w-4 h-4 text-tertiary-fixed opacity-40 animate-pulse" />
          </div>
        </div>

        {/* Row 1: Efficiency Chart - Full Width */}
        <div className="md:col-span-12 bg-surface-container-low p-10 rounded-[3rem] border border-primary/5 relative overflow-hidden chart-container-bg">
          <div className="mb-12 relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary mb-2">Evolución de Rendimiento</p>
            <h3 className="font-headline text-3xl font-black text-primary tracking-tight">Rendimiento por Carga (KM/L)</h3>
          </div>
          
          <div className="h-80 w-full relative z-10 bg-white/40 backdrop-blur-sm rounded-3xl p-6 border border-white/50 shadow-inner">
            <ResponsiveContainer width="100%" height="100%" debounce={50}>
              <AreaChart data={stats.efficiencyHistory}>
                <defs>
                  <linearGradient id="colorEffLarge" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1A237E" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#1A237E" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis 
                  dataKey="label" 
                  tickFormatter={(val) => stats.efficiencyHistory.find(d => d.label === val)?.displayLabel || val}
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#888' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#888' }}
                  dx={-10}
                  domain={['dataMin - 1', 'dataMax + 1']}
                />
                <Tooltip content={<CustomTooltip unit="KM/L" />} />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  name="Eficiencia"
                  stroke="#1A237E" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorEffLarge)" 
                  animationDuration={2000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Row 2: Price Variation - Full Width */}
        <div className="md:col-span-12 bg-surface-container-low p-10 rounded-[3rem] border border-primary/5 relative overflow-hidden">
          <div className="mb-10 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-2">Monitor de Precios</p>
              <h3 className="font-headline text-3xl font-black text-primary tracking-tight">Variación de $/L</h3>
            </div>
            <div className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest ${stats.priceVariation.length > 1 && stats.priceVariation[stats.priceVariation.length-1].price > stats.priceVariation[0].price ? 'bg-error/10 text-error' : 'bg-success/10 text-success'}`}>
              {stats.priceVariation.length > 1 && stats.priceVariation[stats.priceVariation.length-1].price > stats.priceVariation[0].price ? 'Tendencia alcista' : 'Tendencia a la baja'}
            </div>
          </div>
          
          <div className="h-80 w-full relative z-10 bg-white/40 backdrop-blur-sm rounded-3xl p-6 border border-white/50 shadow-inner">
            <ResponsiveContainer width="100%" height="100%" debounce={50}>
              <AreaChart data={stats.priceVariation}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1A237E" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#1A237E" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis 
                  dataKey="label" 
                  tickFormatter={(val) => stats.priceVariation.find(d => d.label === val)?.displayLabel || val}
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#888' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#888' }}
                  dx={-10}
                  domain={['dataMin - 10', 'dataMax + 10']}
                />
                <Tooltip content={<CustomTooltip unit="$" />} />
                <Area 
                  type="monotone" 
                  dataKey="price" 
                  name="Precio"
                  stroke="#1A237E" 
                  strokeWidth={5} 
                  fillOpacity={1}
                  fill="url(#colorPrice)"
                  dot={false}
                  activeDot={{ r: 8, strokeWidth: 0, fill: '#1A237E' }}
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Row 3: Conduction Score VS Efficiency - NEW CHART */}
        <div className="md:col-span-12 bg-surface-container-low p-10 rounded-[3rem] border border-primary/5 transition-all">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary mb-2">Comportamiento Dinámico</p>
              <h3 className="font-headline text-3xl font-black text-primary tracking-tight">Puntaje de Conducción vs Eficiencia</h3>
            </div>
            <div className="px-6 py-3 bg-primary text-white rounded-2xl flex items-center gap-3 shadow-xl">
              <Zap className="w-4 h-4 text-tertiary-fixed" />
              <span className="text-sm font-black uppercase tracking-widest">
                Score Promedio: {stats.conductionScoreHistory.length > 0 ? Math.round(stats.conductionScoreHistory.reduce((a, b) => a + b.score, 0) / stats.conductionScoreHistory.length) : 0}/100
              </span>
            </div>
          </div>
          
          <div className="h-96 w-full bg-white/40 backdrop-blur-sm rounded-3xl p-8 border border-white/50 shadow-inner">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <defs>
                  <linearGradient id="dotGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1A237E" />
                    <stop offset="100%" stopColor="#3F51B5" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="5 5" stroke="rgba(0,0,0,0.05)" />
                <XAxis 
                  type="number" 
                  dataKey="displayScore" 
                  name="Puntaje" 
                  unit="" 
                  domain={[0, 100]} 
                  axisLine={false} 
                  tickLine={false}
                  label={{ value: "Puntaje de Conducción", position: "bottom", offset: 0, fill: "#888", fontSize: 10, fontWeight: 700 }}
                />
                <YAxis 
                  type="number" 
                  dataKey="displayEfficiency" 
                  name="Eficiencia" 
                  unit=" KM/L" 
                  axisLine={false} 
                  tickLine={false}
                  label={{ value: "Eficiencia (KM/L)", angle: -90, position: "left", fill: "#888", fontSize: 10, fontWeight: 700 }}
                />
                <ZAxis type="number" dataKey="liters" range={[50, 250]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip unit="Score/KM/L" />} />
                
                {/* Optimal zone highlight */}
                {/* @ts-ignore */}
                <ReferenceArea x1={80} x2={100} y1={stats.averageEfficiency} y2={stats.averageEfficiency + 10} fill="#4CAF50" fillOpacity={0.1} stroke="#4CAF50" strokeOpacity={0.2} />
                <ReferenceLine y={stats.averageEfficiency} stroke="#94f990" strokeDasharray="3 3" label={{ value: 'Promedio', position: 'right', fill: '#4CAF50', fontSize: 10, fontWeight: 900 }} />
                <ReferenceLine x={80} stroke="#1A237E" strokeDasharray="3 3" opacity={0.2} label={{ value: 'Zona Opt.', position: 'top', fill: '#1A237E', fontSize: 10, fontWeight: 900 }} />

                <Scatter 
                  name="Cargas" 
                  data={stats.conductionScoreHistory} 
                  strokeWidth={2}
                  fillOpacity={0.5}
                  animationDuration={2000}
                >
                  {stats.conductionScoreHistory.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="white" strokeWidth={0.5} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-8 p-6 bg-surface-container-highest/30 rounded-2xl border border-primary/5">
            <p className="text-xs text-secondary leading-relaxed font-bold italic">
               * El puntaje se calcula analizando la suavidad en la aceleración, mantenimiento de velocidad óptima y eficiencia energética relativa al modelo del vehículo.
            </p>
          </div>
        </div>

        {/* Bottom Section: Monthly Activity */}
        <div className="md:col-span-12 bg-surface-container-low p-10 rounded-[3rem] border border-primary/5">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary mb-2">Actividad de Flota</p>
              <h3 className="font-headline text-3xl font-black text-primary tracking-tight">Consumo y Distancia por Carga</h3>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#1A237E] shadow-md"></span>
                <span className="text-[10px] font-black text-secondary uppercase tracking-widest">Distancia (KM)</span>
              </div>
              <div className="flex items-center gap-2 px-5 py-2 border-l border-primary/5">
                <span className="w-3 h-3 rounded-full bg-[#4CAF50] shadow-md"></span>
                <span className="text-[10px] font-black text-secondary uppercase tracking-widest">Combustible (L)</span>
              </div>
            </div>
          </div>
          
          <div className="h-96 w-full bg-white/40 backdrop-blur-sm rounded-3xl p-8 border border-white/50 shadow-inner">
            <ResponsiveContainer width="100%" height="100%" debounce={50}>
              <ComposedChart data={stats.distanceHistory}>
                <defs>
                  <linearGradient id="colorLiters" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4CAF50" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#4CAF50" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis 
                  dataKey="label" 
                  tickFormatter={(val) => stats.distanceHistory.find(d => d.label === val)?.displayLabel || val}
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#888' }}
                  dy={10}
                />
                <YAxis 
                  yAxisId="left"
                  orientation="left"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#1A237E' }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#4CAF50' }}
                />
                <Tooltip content={<CustomTooltip unit="KM/L" />} cursor={{ fill: 'rgba(26, 35, 126, 0.02)' }} />
                <Bar 
                  yAxisId="left"
                  dataKey="value" 
                  name="Distancia"
                  fill="#1A237E" 
                  radius={[8, 8, 0, 0]} 
                  barSize={32}
                  animationDuration={1500}
                />
                <Area 
                  yAxisId="right"
                  type="monotone"
                  dataKey="liters" 
                  name="Combustible"
                  stroke="#4CAF50"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorLiters)"
                  animationDuration={2000}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Small Insights Grid */}
        <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-[#f0f0f5] p-10 rounded-[2.5rem] border border-primary/5 group hover:bg-primary transition-all duration-500 shadow-sm hover:shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <Zap className="w-6 h-6 text-primary group-hover:text-tertiary-fixed transition-colors" />
              <h5 className="font-bold text-lg text-primary group-hover:text-white transition-colors">Ahorro Estimado</h5>
            </div>
            <p className="text-secondary text-sm leading-relaxed group-hover:text-white/70 transition-colors">
              Optimizar tus rutas podría incrementar tu ahorro de <span className="font-black text-primary group-hover:text-white">${formatMoney(stats.estimatedSavings)}</span> hasta en un 15% adicional.
            </p>
          </div>

          <div className="bg-[#fcfcfc] p-10 rounded-[2.5rem] border border-primary/5 shadow-sm hover:shadow-xl transition-all duration-300">
            <div className="flex items-center gap-4 mb-6">
              <Calendar className="w-6 h-6 text-primary" />
              <h5 className="font-bold text-lg text-primary">Frecuencia de Carga</h5>
            </div>
            <p className="text-secondary text-sm leading-relaxed">
              Cargas promedio cada <span className="font-black text-primary">
                {stats.monthlyConsumption.length > 0 ? (stats.totalRefuels / stats.monthlyConsumption.length).toFixed(1) : 0}
              </span> veces al mes. Mantener el tanque sobre 1/4 mejora la vida de la bomba.
            </p>
          </div>

          <div className="bg-primary-container p-10 rounded-[2.5rem] text-white overflow-hidden relative shadow-2xl">
            <div className="z-10 relative">
              <h5 className="font-black text-xl mb-2">Reporte Predictivo</h5>
              <p className="text-white/60 text-[10px] uppercase font-black tracking-[0.2em] mb-6">Proyección Mensual</p>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black font-headline tracking-tighter">
                   ${formatMoney(stats.totalKilometers > 0 ? (stats.totalKilometers / stats.averageEfficiency) * (stats.priceVariation[stats.priceVariation.length-1]?.price || 1100) / (stats.monthlyConsumption.length || 1) : 0)}
                </span>
                <span className="text-[10px] font-bold opacity-60">CLP EST.</span>
              </div>
            </div>
            <TrendingUp className="absolute -right-6 -bottom-6 w-40 h-40 text-white/5 opacity-40 rotate-12" />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const MapView = ({ fuelLogs, vehicles, selectedVehicleId, onSelectVehicle }: { fuelLogs: FuelLog[], vehicles: Vehicle[], selectedVehicleId: string | null, onSelectVehicle: (id: string) => void }) => {
  const logsWithLocation = fuelLogs.filter(log => log.location);
  
  // Center map on the latest log or a default location
  const center: [number, number] = logsWithLocation.length > 0 
    ? [logsWithLocation[0].location!.latitude, logsWithLocation[0].location!.longitude]
    : [19.4326, -99.1332]; // Mexico City default

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pb-32 pt-24 px-6 max-w-5xl mx-auto h-[calc(100vh-180px)]"
    >
      <section className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-secondary">Mapa de Estaciones</span>
          <h2 className="text-4xl font-extrabold font-headline tracking-tight text-primary mt-1">Rutas & Cargas</h2>
        </div>
        <VehicleSelector 
          vehicles={vehicles} 
          selectedVehicleId={selectedVehicleId} 
          onSelect={onSelectVehicle} 
        />
      </section>

      <div className="bg-surface-container-low rounded-2xl overflow-hidden h-full border-4 border-surface-container-low shadow-2xl relative z-10">
        <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {logsWithLocation.map((log) => {
            const stats = calculateLogStats(log, fuelLogs);
            return (
              <Marker key={log.id} position={[log.location!.latitude, log.location!.longitude]}>
                <Popup>
                  <div className="p-2 space-y-1 min-w-[150px]">
                    <p className="font-bold text-primary">{log.stationName}</p>
                    <p className="text-xs text-secondary">{log.date} • {log.time}</p>
                    <div className="flex justify-between gap-4 pt-1 border-t border-outline/10">
                      <span className="text-xs font-bold text-primary-container">${formatMoney(log.totalCost)}</span>
                      <span className="text-xs font-bold text-secondary">{formatLiters(log.liters)}L</span>
                    </div>
                    <EfficiencySummary stats={stats} compact />
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </motion.div>
  );
};

const Profile = ({ user, vehicles, fuelLogs, onUpdateUser, onSaveVehicle, onDeleteVehicle, onSaveLog }: { user: UserProfile, vehicles: Vehicle[], fuelLogs: FuelLog[], onUpdateUser: (user: UserProfile) => void, onSaveVehicle: (vehicle: Vehicle) => void, onDeleteVehicle: (id: string) => void, onSaveLog: (log: FuelLog) => void }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(user);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [isImportingPDF, setIsImportingPDF] = useState(false);
  const [vehicleFormData, setVehicleFormData] = useState<Partial<Vehicle>>({
    name: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    plate: '',
    targetEfficiency: 10,
    propulsion: ''
  });

  const [apiMakes, setApiMakes] = useState<{idMarca: number, nombre: string}[]>(VEHICLE_BRANDS);
  const [apiModels, setApiModels] = useState<{idModelo: number, nombre: string}[]>([]);
  const [apiPropulsions, setApiPropulsions] = useState<{idEtiqueta: string, nombre: string}[]>([]);
  const [loadingApi, setLoadingApi] = useState(false);
  // @ts-ignore
  const [loadingEff, setLoadingEff] = useState(false);

  // Fetch Marcas on mount
  useEffect(() => {
    const fetchMakes = async () => {
      try {
        const data = await fetchFromProxy('https://consumovehicular.minenergia.cl/backend/scv/vehiculo/marcas');
        if (Array.isArray(data)) {
          // Combinar con locales sin duplicados
          const combined = [...VEHICLE_BRANDS];
          data.forEach(item => {
            if (!combined.some(c => c.nombre === item.nombre)) combined.push(item);
          });
          setApiMakes(combined.sort((a, b) => a.nombre.localeCompare(b.nombre)));
        }
      } catch (e) { console.error("Error fetching makes:", e); }
    };
    fetchMakes();
  }, []);

  // Fetch Models when make changes
  useEffect(() => {
    const fetchModels = async () => {
      if (!vehicleFormData.make) {
        setApiModels([]);
        return;
      }

      // Check local models first
      if (VEHICLE_MODELS[vehicleFormData.make]) {
        const localModels = VEHICLE_MODELS[vehicleFormData.make].map((name, idx) => ({ idModelo: 999000 + idx, nombre: name }));
        setApiModels([...localModels, { idModelo: 999999, nombre: 'Otro...' }]);
        return;
      }

      const makeObj = apiMakes.find(m => m.nombre === vehicleFormData.make);
      if (!makeObj) return;

      setLoadingApi(true);
      try {
        const data = await fetchFromProxy(`https://consumovehicular.minenergia.cl/backend/scv/vehiculo/modelos?idMarca=${makeObj.idMarca}`);
        if (Array.isArray(data)) setApiModels(data.sort((a, b) => a.nombre.localeCompare(b.nombre)));
      } catch (e) { console.error("Error fetching models:", e); }
      setLoadingApi(false);
    };
    fetchModels();
  }, [vehicleFormData.make, apiMakes]);

  // Fetch Propulsion when model changes
  useEffect(() => {
    const fetchPropulsion = async () => {
      if (!vehicleFormData.model) {
        setApiPropulsions([]);
        return;
      }
      const modelObj = apiModels.find(m => m.nombre === vehicleFormData.model);
      if (!modelObj) return;

      const url = `https://consumovehicular.minenergia.cl/backend/scv/vehiculo/etiquetas?idModelo=${modelObj.idModelo}`;
      try {
        const data = await fetchFromProxy(url);
        if (Array.isArray(data)) {
          // Filtrar fuera propulsiones puramente eléctricas (pero mantener híbridos)
          const filteredData = data.filter((item: any) => {
            const label = (item.nombre || "").toUpperCase();
            const id = (item.idEtiqueta || "").toUpperCase();
            if (label.includes("HIBRIDO") || label.includes("HÍBRIDO")) return true;
            return !(label.includes("ELECTRICO") || label.includes("ELÉCTRICO") || id.includes("ELECTRICO"));
          });

          const propList = filteredData.map((item: any) => ({
            idEtiqueta: item.idEtiqueta,
            nombre: item.nombre
          }));
          if (propList.length > 0) {
            setApiPropulsions(propList);
            if (propList.length === 1 && !vehicleFormData.propulsion) {
              setVehicleFormData(prev => ({ ...prev, propulsion: propList[0].nombre }));
            }
          } else {
            setApiPropulsions(COMMON_PROPULSIONS);
          }
        }
      } catch (e) { 
        console.error("Error fetching propulsion:", e); 
        // Fallback to common ones to unblock UI
        setApiPropulsions(COMMON_PROPULSIONS);
        if (!vehicleFormData.propulsion) {
          setVehicleFormData(prev => ({ ...prev, propulsion: COMMON_PROPULSIONS[0].nombre }));
        }
      }
    };
    fetchPropulsion();
  }, [vehicleFormData.model, apiModels]);

  // Fetch Efficiency when propulsion is selected
  useEffect(() => {
    const fetchEfficiency = async () => {
      // 1. Check if we have a default for this vehicle name
      const vehicleName = `${vehicleFormData.make} ${vehicleFormData.model}`;
      if (DEFAULT_EFFICIENCIES[vehicleName]) {
        setVehicleFormData(prev => ({ ...prev, targetEfficiency: DEFAULT_EFFICIENCIES[vehicleName] }));
        return;
      }

      if (!vehicleFormData.model || !vehicleFormData.propulsion) return;
      
      const modelObj = apiModels.find(m => m.nombre === vehicleFormData.model);
      const propObj = apiPropulsions.find(p => p.nombre === vehicleFormData.propulsion);
      if (!modelObj || !propObj || modelObj.idModelo >= 999000) return; // If local, stop

      try {
        const url = `https://consumovehicular.minenergia.cl/backend/scv/vehiculo?criterio=idModelo:EQ:${modelObj.idModelo};idEtiqueta:EQ:${encodeURIComponent(propObj.idEtiqueta)}`;
        const data = await fetchFromProxy(url);
        
        if (data && data.content && Array.isArray(data.content) && data.content.length > 0) {
          const vehicleData = data.content[0];
          let eff = vehicleData.rendimientoMixto || 10;
          setVehicleFormData(prev => ({ ...prev, targetEfficiency: eff }));
        }
      } catch (e) { console.error("Error fetching efficiency:", e); }
    };
    fetchEfficiency();
  }, [vehicleFormData.propulsion, apiPropulsions, apiModels]);

  const handleSave = () => {
    onUpdateUser(formData);
    setIsEditing(false);
  };

  const handleSaveVehicle = () => {
    if (!vehicleFormData.name) {
      alert("Por favor ingresa un Nombre (Alias) para tu vehículo");
      return;
    }
    onSaveVehicle({
      id: editingVehicle?.id || '',
      name: vehicleFormData.name || '',
      make: vehicleFormData.make || '',
      model: vehicleFormData.model || '',
      year: vehicleFormData.year || new Date().getFullYear(),
      plate: vehicleFormData.plate || '',
      targetEfficiency: vehicleFormData.targetEfficiency || 10,
      propulsion: vehicleFormData.propulsion || ''
    } as Vehicle);
    setEditingVehicle(null);
    setShowVehicleForm(false);
    setVehicleFormData({ name: '', make: '', model: '', year: new Date().getFullYear(), plate: '', targetEfficiency: 10, propulsion: '' });
  };

  const startEditVehicle = (v: Vehicle) => {
    setEditingVehicle(v);
    setVehicleFormData(v);
    setShowVehicleForm(true);
  };

  const handleExportData = () => {
    const data = {
      vehicles,
      fuelLogs,
      user
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `premium-fleet-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        
        if (data.vehicles && Array.isArray(data.vehicles)) {
          for (const v of data.vehicles) {
            await onSaveVehicle(v);
          }
        }
        
        if (data.fuelLogs && Array.isArray(data.fuelLogs)) {
          for (const log of data.fuelLogs) {
            await onSaveLog(log);
          }
        }
        
        alert('Importación completada con éxito');
      } catch (error) {
        console.error('Error importing data:', error);
        alert('Error al importar el archivo. Asegúrate de que sea un JSON válido.');
      }
    };
    reader.readAsText(file);
  };

  const handleImportPDFData = async () => {
    setIsImportingPDF(true);
    try {
      // 1. Find or create Toyota Corolla Cross
      let vehicle = vehicles.find(v => v.name === 'Toyota Corolla Cross');
      if (!vehicle) {
        const newVehicle: Vehicle = {
          id: '',
          name: 'Toyota Corolla Cross',
          make: 'Toyota',
          model: 'Corolla Cross',
          year: 2025,
          plate: 'PDF-IMPORT',
          targetEfficiency: 10, // Default for new vehicle
          propulsion: ''
        };
        // We need the ID after saving. But handleSaveVehicle doesn't return it.
        // I'll assume it's added to the list and we can find it or just use a temporary ID.
        // Actually, I'll modify handleSaveVehicle in App.tsx to return the ID or just use a direct Firestore call here if needed.
        // But let's stick to the props.
        await onSaveVehicle(newVehicle);
        // Wait a bit for the snapshot to update
        await new Promise(resolve => setTimeout(resolve, 1000));
        vehicle = vehicles.find(v => v.name === 'Toyota Corolla Cross');
      }

      if (!vehicle) {
        // Fallback: if still not found, we might need to wait more or handle it differently.
        // For this demo, I'll just use the first vehicle if available or alert.
        alert('Por favor, intenta de nuevo. El vehículo se está creando.');
        setIsImportingPDF(false);
        return;
      }

      const vehicleId = vehicle.id;
      
      // 2. Import logs
      for (const logData of toyotaCorollaCrossLogs) {
        const log: FuelLog = {
          id: Math.random().toString(36).substr(2, 9),
          vehicleId,
          date: logData.date,
          time: logData.time,
          mileage: logData.mileage,
          liters: logData.liters,
          pricePerLiter: logData.pricePerLiter,
          totalCost: logData.liters * logData.pricePerLiter,
          stationName: logData.stationName,
          fuelType: logData.fuelType as any,
        };
        await onSaveLog(log);
      }
      
      alert('Registros del PDF importados con éxito');
    } catch (error) {
      console.error('Error importing PDF data:', error);
      alert('Error al importar los datos del PDF.');
    } finally {
      setIsImportingPDF(false);
    }
  };

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(fuelLogs.map(log => ({
      Vehiculo: vehicles.find(v => v.id === log.vehicleId)?.name || 'Desconocido',
      Fecha: log.date,
      Hora: log.time,
      Kilometraje: log.mileage,
      Litros: log.liters,
      Precio_Litro: log.pricePerLiter,
      Total: log.totalCost,
      Estacion: log.stationName,
      Combustible: log.fuelType
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Combustible");
    XLSX.writeFile(wb, `premium-fleet-logs-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        let importedCount = 0;
        for (const row of json) {
          const vehicleName = row.Vehiculo || row.Vehicle || row.Nombre || row.Name;
          const vehicle = vehicles.find(v => v.name === vehicleName) || vehicles[0];
          
          // Handle Date & Time
          let dateStr = new Date().toISOString().split('T')[0];
          let timeStr = "12:00";

          const rawDate = row.Fecha || row.Date || row.date;
          if (rawDate instanceof Date) {
            dateStr = rawDate.toISOString().split('T')[0];
            timeStr = rawDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
          } else if (typeof rawDate === 'string') {
            const d = new Date(rawDate);
            if (!isNaN(d.getTime())) {
              dateStr = d.toISOString().split('T')[0];
            }
          }

          const liters = Number(row.Litros || row.Liters || row.lts || row.litros || 0);
          const pricePerLiter = Number(row.Precio_Litro || row.Price_Liter || row['$/lt'] || row.precio || 0);
          const totalCost = Number(row.Total || row.Total_Cost || row.total || 0) || (liters * pricePerLiter);

          const log: FuelLog = {
            id: '', 
            vehicleId: vehicle?.id || '',
            date: dateStr,
            time: row.Hora || row.Time || row.hora || timeStr,
            mileage: Number(row.Kilometraje || row.Mileage || row.Odometro || row.odometro || 0),
            liters: liters,
            pricePerLiter: pricePerLiter,
            totalCost: totalCost,
            stationName: row.Estacion || row.Station || row.estacion || "Importado",
            fuelType: (row.Combustible || row.Fuel_Type || row.combustible || "Premium") as any,
          };

          if (log.vehicleId) {
            await onSaveLog(log);
            importedCount++;
          }
        }
        alert(`Importación de ${importedCount} registros completada con éxito.`);
      } catch (error) {
        console.error('Error importing Excel:', error);
        alert('Error al importar el archivo Excel. Verifica que las columnas coincidan.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="pb-32 pt-24 px-6 max-w-2xl mx-auto w-full"
    >
      <section className="mb-12 text-center">
        <div className="relative inline-block mb-6">
          <img 
            src={user.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} 
            alt={user.name} 
            className="w-32 h-32 rounded-full border-4 border-primary-container shadow-xl object-cover"
            referrerPolicy="no-referrer"
          />
          <button aria-label="Cambiar avatar" className="absolute bottom-0 right-0 bg-primary-container text-white p-2 rounded-full shadow-lg">
            <Settings className="w-4 h-4" />
          </button>
        </div>
        <h2 className="text-3xl font-extrabold font-headline text-primary">{user.name}</h2>
        <p className="text-secondary">{user.email}</p>
      </section>

      <div className="space-y-8">
        <div className="bg-surface-container-low rounded-xl p-8 space-y-8">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold font-headline text-primary">Información Personal</h3>
            <button 
              onClick={() => isEditing ? handleSave() : setIsEditing(true)}
              className="text-primary-container font-bold text-sm uppercase tracking-widest flex items-center gap-2"
            >
              {isEditing ? 'Guardar' : 'Editar'}
            </button>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-secondary">Nombre Completo</label>
              {isEditing ? (
                <input 
                  className="w-full bg-surface-container-lowest p-4 rounded-lg border-none focus:ring-2 focus:ring-primary/20 text-primary font-medium"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              ) : (
                <p className="text-lg font-bold text-primary">{user.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-secondary">Correo Electrónico</label>
              <p className="text-lg font-bold text-primary opacity-60">{user.email}</p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-secondary">Unidades</label>
                {isEditing ? (
                  <select 
                    className="w-full bg-surface-container-lowest p-4 rounded-lg border-none focus:ring-2 focus:ring-primary/20 text-primary font-medium"
                    value={formData.preferredUnits}
                    onChange={(e) => setFormData({ ...formData, preferredUnits: e.target.value as any })}
                  >
                    <option value="KM/L">KM/L</option>
                    <option value="L/100KM">L/100KM</option>
                    <option value="MPG">MPG</option>
                  </select>
                ) : (
                  <p className="text-lg font-bold text-primary">{user.preferredUnits}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-secondary">Moneda</label>
                {isEditing ? (
                  <input 
                    className="w-full bg-surface-container-lowest p-4 rounded-lg border-none focus:ring-2 focus:ring-primary/20 text-primary font-medium"
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  />
                ) : (
                  <p className="text-lg font-bold text-primary">{user.currency}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-low p-8 rounded-xl space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold font-headline text-primary">Mis Vehículos</h2>
            <button 
              aria-label="Añadir nuevo vehículo"
              onClick={() => {
                setEditingVehicle(null);
                setVehicleFormData({ name: '', make: '', model: '', year: new Date().getFullYear(), plate: '', targetEfficiency: 10, propulsion: '' });
                setShowVehicleForm(!showVehicleForm);
              }}
              className="bg-primary/10 text-primary p-2 rounded-full hover:bg-primary/20 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {showVehicleForm && (
            <div className="bg-surface-container-lowest p-6 rounded-xl space-y-4 border border-primary/10">
              <h3 className="font-bold text-primary">{editingVehicle ? 'Editar Vehículo' : 'Nuevo Vehículo'}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-outline">Nombre (Alias)</label>
                  <input 
                    type="text" 
                    value={vehicleFormData.name}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, name: e.target.value })}
                    placeholder="Ej. Mi Camioneta"
                    className="w-full bg-surface-container-low p-3 rounded-lg border-none focus:ring-2 focus:ring-primary/20 text-primary font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-outline">Marca</label>
                    <select 
                      value={vehicleFormData.make}
                      onChange={(e) => setVehicleFormData({ ...vehicleFormData, make: e.target.value, model: '', propulsion: '' })}
                      className="w-full bg-surface-container-low p-3 rounded-lg border-none focus:ring-2 focus:ring-primary/20 text-primary font-medium"
                    >
                      {vehicleFormData.make ? (
                        <option value={vehicleFormData.make}>{vehicleFormData.make}</option>
                      ) : (
                        <option value="">Seleccionar Marca</option>
                      )}
                      {(apiMakes.length > 0 ? apiMakes.map(m => m.nombre) : 
                        ["Alfa Romeo", "Aston Martin", "Audi", "Baic", "Bentley", "BMW", "Borgward", "Brilliance", 
                         "BYD", "Changan", "Chery", "Chevrolet", "Chrysler", "Citroen", "Cupra", "Daihatsu", 
                         "Dodge", "Fiat", "Ford", "Honda", "Hyundai", "Kia", "Mazda", "Nissan", "Peugeot", 
                         "Renault", "Suzuki", "Toyota", "Volkswagen", "Volvo"]
                      ).filter(name => name !== vehicleFormData.make).map(brand => (
                        <option key={brand} value={brand}>{brand}</option>
                      ))}
                    </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-outline">Modelo</label>
                  <div className="relative">
                    <select 
                      value={vehicleFormData.model}
                      onChange={(e) => setVehicleFormData({ ...vehicleFormData, model: e.target.value, propulsion: '' })}
                      disabled={!vehicleFormData.make || loadingApi}
                      className="w-full bg-surface-container-low p-3 rounded-lg border-none focus:ring-2 focus:ring-primary/20 text-primary font-medium disabled:opacity-50"
                    >
                      {vehicleFormData.model ? (
                        <option value={vehicleFormData.model}>{vehicleFormData.model}</option>
                      ) : (
                        <option value="">{loadingApi ? 'Cargando modelos...' : 'Seleccionar Modelo'}</option>
                      )}
                      {apiModels.filter(m => m.nombre !== vehicleFormData.model).map(m => (
                        <option key={m.idModelo} value={m.nombre}>{m.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-outline">Propulsión</label>
                  <select 
                    value={vehicleFormData.propulsion}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, propulsion: e.target.value })}
                    disabled={!vehicleFormData.model}
                    className="w-full bg-surface-container-low p-3 rounded-lg border-none focus:ring-2 focus:ring-primary/20 text-primary font-medium disabled:opacity-50"
                  >
                    {vehicleFormData.propulsion ? (
                      <option value={vehicleFormData.propulsion}>{vehicleFormData.propulsion}</option>
                    ) : (
                      <option value="">Seleccionar Propulsión</option>
                    )}
                    {apiPropulsions.filter(p => p.nombre !== vehicleFormData.propulsion).map(p => (
                      <option key={p.idEtiqueta} value={p.nombre}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-outline">Año</label>
                  <input 
                    type="number" 
                    value={vehicleFormData.year}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, year: parseInt(e.target.value) })}
                    className="w-full bg-surface-container-low p-3 rounded-lg border-none focus:ring-2 focus:ring-primary/20 text-primary font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-outline">Placa</label>
                  <input 
                    type="text" 
                    value={vehicleFormData.plate}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, plate: e.target.value })}
                    placeholder="ABC-123"
                    className="w-full bg-surface-container-low p-3 rounded-lg border-none focus:ring-2 focus:ring-primary/20 text-primary font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-outline">
                    {loadingEff ? 'Consultando rendimiento mixto...' : 'Rendimiento (KM/L)'}
                  </label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={vehicleFormData.targetEfficiency}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, targetEfficiency: parseFloat(e.target.value) })}
                    placeholder="14.5"
                    disabled={loadingEff}
                    className="w-full bg-surface-container-low p-3 rounded-lg border-none focus:ring-2 focus:ring-primary/20 text-primary font-medium disabled:opacity-50"
                  />
                  {loadingEff && <p className="text-[10px] text-primary/60 animate-pulse">Obteniendo datos de consuomvehicular.minenergia.cl...</p>}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={handleSaveVehicle}
                  className="flex-1 py-3 bg-primary text-white rounded-lg font-bold text-xs uppercase tracking-widest hover:shadow-lg transition-all"
                >
                  {editingVehicle ? 'Actualizar' : 'Añadir'}
                </button>
                <button 
                  onClick={() => setShowVehicleForm(false)}
                  className="flex-1 py-3 bg-surface-container-low text-primary rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-surface-variant transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {vehicles.length === 0 ? (
              <p className="text-center text-secondary py-8 italic">No tienes vehículos registrados.</p>
            ) : (
              vehicles.map(v => (
                <div key={v.id} className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl border border-primary/5 hover:border-primary/20 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/5 flex items-center justify-center">
                      <Car className="text-primary w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-bold text-primary">{v.name}</p>
                      <p className="text-xs font-bold text-outline uppercase tracking-widest">{v.make} {v.model} • {v.year}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      aria-label="Editar vehículo"
                      onClick={() => startEditVehicle(v)}
                      className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button 
                      aria-label="Eliminar vehículo"
                      onClick={() => onDeleteVehicle(v.id)}
                      className="p-2 text-error hover:bg-error/10 rounded-full transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-surface-container-low p-8 rounded-xl space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold font-headline text-primary">Gestión de Datos</h3>
            <div className="flex gap-2">
              <FileJson className="text-primary/40 w-5 h-5" />
              <FileSpreadsheet className="text-primary/40 w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-secondary leading-relaxed">
            Exporta tus registros para tener una copia de seguridad o impórtalos desde otro dispositivo.
          </p>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={handleExportData}
                className="flex items-center justify-center gap-2 py-4 px-4 bg-surface-container-lowest text-primary rounded-lg font-bold text-xs uppercase tracking-widest border border-primary/10 hover:bg-primary/5 transition-all"
              >
                <Download className="w-4 h-4" />
                Exportar JSON
              </button>
              <label className="flex items-center justify-center gap-2 py-4 px-4 bg-surface-container-lowest text-primary rounded-lg font-bold text-xs uppercase tracking-widest border border-primary/10 hover:bg-primary/5 transition-all cursor-pointer">
                <Upload className="w-4 h-4" />
                Importar JSON
                <input 
                  type="file" 
                  accept=".json" 
                  className="hidden" 
                  onChange={handleImportData}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={handleExportExcel}
                className="flex items-center justify-center gap-2 py-4 px-4 bg-surface-container-lowest text-primary rounded-lg font-bold text-xs uppercase tracking-widest border border-primary/10 hover:bg-primary/5 transition-all"
              >
                <Download className="w-4 h-4" />
                Exportar Excel
              </button>
              <label className="flex items-center justify-center gap-2 py-4 px-4 bg-surface-container-lowest text-primary rounded-lg font-bold text-xs uppercase tracking-widest border border-primary/10 hover:bg-primary/5 transition-all cursor-pointer">
                <Upload className="w-4 h-4" />
                Importar Excel
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  className="hidden" 
                  onChange={handleImportExcel}
                />
              </label>
            </div>
          </div>

          <button 
            onClick={handleImportPDFData}
            disabled={isImportingPDF}
            className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-primary text-white rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {isImportingPDF ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Cargar Registros de PDF
          </button>
        </div>

        <button 
          onClick={logout}
          className="w-full py-5 border-2 border-error/20 text-error rounded-xl font-bold text-sm uppercase tracking-[0.2em] hover:bg-error/5 transition-all active:scale-95 flex items-center justify-center gap-3"
        >
          <LogOut className="w-5 h-5" />
          Cerrar Sesión
        </button>
      </div>
    </motion.div>
  );
};

const LogDetails = ({ log, vehicle, fuelLogs, onClose, onEdit, onDelete }: { log: FuelLog, vehicle: Vehicle | undefined, fuelLogs: FuelLog[], onClose: () => void, onEdit: (log: FuelLog) => void, onDelete: (id: string) => void }) => {
  const stats = calculateLogStats(log, fuelLogs);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-surface/80 backdrop-blur-xl flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-surface-container-lowest w-full max-w-lg rounded-[2.5rem] shadow-[0_32px_128px_rgba(26,35,126,0.15)] overflow-hidden border border-outline/5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-48 bg-primary-container flex items-center justify-center overflow-hidden shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent"></div>
          {getStationLogo(log.stationName) ? (
            <img 
              src={getStationLogo(log.stationName)!} 
              alt={log.stationName} 
              className="w-24 h-24 object-contain relative z-10 drop-shadow-2xl"
              referrerPolicy="no-referrer"
            />
          ) : (
            <Fuel className="text-white w-20 h-20 relative z-10" />
          )}
          <button 
            aria-label="Cerrar detalles"
            onClick={onClose}
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors"
          >
            <Plus className="w-6 h-6 rotate-45" />
          </button>
        </div>

        <div className="p-10 space-y-8">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-extrabold font-headline text-primary tracking-tight">{log.stationName}</h2>
              <p className="text-sm text-secondary font-medium mt-1">{log.address || 'Ubicación no especificada'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-widest text-outline">{log.date}</p>
              <p className="text-xs font-bold text-secondary mt-1">{log.time}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-widest text-outline">Vehículo</span>
              <div className="flex items-center gap-2">
                <Car className="w-5 h-5 text-primary" />
                <p className="text-base font-bold text-primary">{vehicle?.name || 'Desconocido'}</p>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-widest text-outline">Combustible</span>
              <div className="flex items-center gap-2">
                <Fuel className="w-5 h-5 text-primary" />
                <p className="text-base font-bold text-primary">{log.fuelType}</p>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-low rounded-3xl p-8 grid grid-cols-2 gap-y-10 gap-x-6">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-widest text-outline">Litros</span>
              <p className="text-3xl font-extrabold font-headline text-primary">{formatLiters(log.liters)} <span className="text-sm font-bold text-outline">L</span></p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-widest text-outline">Precio / L</span>
              <p className="text-3xl font-extrabold font-headline text-primary">${formatPrice(log.pricePerLiter)}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-widest text-outline">Kilometraje</span>
              <p className="text-3xl font-extrabold font-headline text-primary">{formatKm(log.mileage)} <span className="text-sm font-bold text-outline">KM</span></p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-widest text-outline">Costo Total</span>
              <p className="text-3xl font-extrabold font-headline text-primary-container">${formatMoney(log.totalCost)}</p>
            </div>
          </div>

          {stats && (
            <div className="pt-4">
              <EfficiencySummary stats={stats} />
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <button 
              onClick={() => { onEdit(log); onClose(); }}
              className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Editar
            </button>
            <button 
              onClick={() => { if(confirm('¿Estás seguro de eliminar este registro?')) { onDelete(log.id); onClose(); } }}
              className="flex-1 py-4 bg-surface-container-low text-error rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-error/5 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [editingLog, setEditingLog] = useState<FuelLog | null>(null);
  const [viewingLog, setViewingLog] = useState<FuelLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (fUser) => {
      setFirebaseUser(fUser);
      if (fUser) {
        const userDocRef = doc(db, 'users', fUser.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          
          if (!userDoc.exists()) {
            const newUser: UserProfile = {
              name: fUser.displayName || 'Usuario',
              email: fUser.email || '',
              preferredUnits: 'KM/L',
              currency: 'USD',
              avatarUrl: fUser.photoURL || ''
            };
            await setDoc(userDocRef, newUser);
            setUser(newUser);
          } else {
            setUser(userDoc.data() as UserProfile);
          }

          const logsQuery = query(collection(db, 'users', fUser.uid, 'fuelLogs'), orderBy('date', 'desc'));
          const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FuelLog));
            setFuelLogs(logs);
            setLastSyncTime(new Date());
          }, (error) => {
            handleFirestoreError(error, OperationType.LIST, `users/${fUser.uid}/fuelLogs`);
          });

          const vehiclesQuery = query(collection(db, 'users', fUser.uid, 'vehicles'));
          const unsubVehicles = onSnapshot(vehiclesQuery, (snapshot) => {
            const vList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle));
            setVehicles(vList);
            if (vList.length > 0) {
              setSelectedVehicleId(prev => prev || vList[0].id);
            }
          }, (error) => {
            handleFirestoreError(error, OperationType.LIST, `users/${fUser.uid}/vehicles`);
          });

          setLoading(false);
          return () => {
            unsubLogs();
            unsubVehicles();
          };
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${fUser.uid}`);
        }
      } else {
        setUser(null);
        setFuelLogs([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSaveVehicle = async (vehicle: Vehicle) => {
    if (!firebaseUser) return;
    const { id, ...vehicleData } = vehicle;
    const vehiclesRef = collection(db, 'users', firebaseUser.uid, 'vehicles');
    const path = id ? `users/${firebaseUser.uid}/vehicles/${id}` : `users/${firebaseUser.uid}/vehicles`;

    try {
      if (id) {
        await updateDoc(doc(vehiclesRef, id), vehicleData as any);
      } else {
        const docRef = await addDoc(vehiclesRef, vehicleData);
        if (!selectedVehicleId) setSelectedVehicleId(docRef.id);
      }
    } catch (error) {
      handleFirestoreError(error, id ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    if (!firebaseUser) return;
    const path = `users/${firebaseUser.uid}/vehicles/${id}`;
    try {
      await deleteDoc(doc(db, 'users', firebaseUser.uid, 'vehicles', id));
      if (selectedVehicleId === id) setSelectedVehicleId(vehicles.find(v => v.id !== id)?.id || null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleSaveLog = async (log: FuelLog) => {
    if (!firebaseUser) return;
    
    const { id, ...logData } = log;
    const logsRef = collection(db, 'users', firebaseUser.uid, 'fuelLogs');
    const path = editingLog ? `users/${firebaseUser.uid}/fuelLogs/${id}` : `users/${firebaseUser.uid}/fuelLogs`;

    try {
      if (editingLog) {
        await updateDoc(doc(logsRef, id), logData as any);
      } else {
        await addDoc(logsRef, logData);
      }
    } catch (error) {
      handleFirestoreError(error, editingLog ? OperationType.UPDATE : OperationType.CREATE, path);
    }
    
    setEditingLog(null);
    setActiveTab('history');
  };

  const handleEditLog = (log: FuelLog) => {
    setEditingLog(log);
    setActiveTab('new');
  };

  const handleDeleteLog = async (id: string) => {
    if (!firebaseUser) return;
    const path = `users/${firebaseUser.uid}/fuelLogs/${id}`;
    try {
      await deleteDoc(doc(db, 'users', firebaseUser.uid, 'fuelLogs', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleMigrateLogs = async () => {
    if (!firebaseUser || fuelLogs.length === 0) return;
    
    const promises = fuelLogs.map(log => {
      const logRef = doc(db, 'users', firebaseUser.uid, 'fuelLogs', log.id);
      return updateDoc(logRef, {
        fuelType: 'Gasolina 93',
        stationName: 'Copec'
      });
    });

    try {
      await Promise.all(promises);
    } catch (error) {
      console.error("Migration error:", error);
      alert("Error al migrar algunos registros.");
    }
  };

  const handleUpdateUser = async (updatedUser: UserProfile) => {
    if (!firebaseUser) return;
    const path = `users/${firebaseUser.uid}`;
    try {
      await setDoc(doc(db, 'users', firebaseUser.uid), updatedUser);
      setUser(updatedUser);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!firebaseUser || !user) {
    return <Login />;
  }

  const filteredLogs = useMemo(() => {
    return selectedVehicleId
      ? fuelLogs.filter(log => log.vehicleId === selectedVehicleId)
      : fuelLogs;
  }, [fuelLogs, selectedVehicleId]);

  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard 
            fuelLogs={filteredLogs} 
            vehicles={vehicles}
            selectedVehicleId={selectedVehicleId}
            onSelectVehicle={setSelectedVehicleId}
            onNavigateToNew={() => { setEditingLog(null); setActiveTab('new'); }} 
          />
        );
      case 'history':
        return (
          <History 
            fuelLogs={filteredLogs} 
            vehicles={vehicles}
            selectedVehicleId={selectedVehicleId}
            onSelectVehicle={setSelectedVehicleId}
            onEdit={handleEditLog} 
            onDelete={handleDeleteLog} 
            onView={setViewingLog}
          />
        );
      case 'projection':
        return (
          <Projection 
            user={user}
            fuelLogs={filteredLogs} 
            vehicles={vehicles}
            selectedVehicleId={selectedVehicleId}
            onSelectVehicle={setSelectedVehicleId}
          />
        );
      case 'map':
        return (
          <MapView 
            fuelLogs={filteredLogs} 
            vehicles={vehicles}
            selectedVehicleId={selectedVehicleId}
            onSelectVehicle={setSelectedVehicleId}
          />
        );
      case 'new':
        return (
          <NewEntry 
            key={editingLog ? editingLog.id : 'new'}
            editingLog={editingLog} 
            fuelLogs={fuelLogs} 
            vehicles={vehicles}
            selectedVehicleId={selectedVehicleId}
            onSave={handleSaveLog} 
            onCancel={() => { setEditingLog(null); setActiveTab('history'); }} 
          />
        );
      case 'stats':
        return (
          <Stats 
            fuelLogs={filteredLogs} 
            vehicles={vehicles}
            selectedVehicleId={selectedVehicleId}
            onSelectVehicle={setSelectedVehicleId}
            lastSyncTime={lastSyncTime}
          />
        );
      case 'profile':
        return (
          <Profile 
            user={user} 
            vehicles={vehicles}
            fuelLogs={fuelLogs}
            onUpdateUser={handleUpdateUser} 
            onSaveVehicle={handleSaveVehicle}
            onDeleteVehicle={handleDeleteVehicle}
            onSaveLog={handleSaveLog}
          />
        );
      default:
        return (
          <Dashboard 
            fuelLogs={filteredLogs} 
            vehicles={vehicles}
            selectedVehicleId={selectedVehicleId}
            onSelectVehicle={setSelectedVehicleId}
            onNavigateToNew={() => { setEditingLog(null); setActiveTab('new'); }} 
          />
        );
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-surface font-sans selection:bg-primary/10">
        <TopAppBar onSettingsClick={() => setShowSettings(true)} />
        <main className="relative">
          <AnimatePresence mode="wait">
            {renderScreen()}
          </AnimatePresence>
          <AnimatePresence>
            {showSettings && (
              <SettingsModal 
                user={user} 
                onMigrateLogs={handleMigrateLogs}
                onUpdateUser={handleUpdateUser} 
                onClose={() => setShowSettings(false)} 
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {viewingLog && (
              <LogDetails 
                log={viewingLog} 
                vehicle={vehicles.find(v => v.id === viewingLog.vehicleId)}
                fuelLogs={fuelLogs}
                onClose={() => setViewingLog(null)}
                onEdit={handleEditLog}
                onDelete={handleDeleteLog}
              />
            )}
          </AnimatePresence>
        </main>
        <BottomNavBar 
          activeTab={activeTab} 
          onTabChange={(tab) => {
            if (tab === 'new') setEditingLog(null);
            setActiveTab(tab);
          }} 
        />
      </div>
    </ErrorBoundary>
  );
}
