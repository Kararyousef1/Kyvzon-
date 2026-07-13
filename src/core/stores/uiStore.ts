import { create } from 'zustand';
import { supabase } from '../../services/supabase/supabase';
import type { LandingConfig } from '../../shared/types/landing';

const defaultConfig: LandingConfig = {
  themeColor: '#4f46e5',
  logoTextAr: 'Kyvzon',
  logoTextEn: 'Kyvzon',
  logoUrl: '',
  logoSymbol: '◆',
  heroTitleAr: 'ريادة في الصناعات الدوائية',
  heroTitleEn: 'Leading Enterprise Solutions',
  heroDescAr: 'نحن شركة رائدة في مجال الصناعات الدوائية',
  heroDescEn: 'We are a leading enterprise platform',
  aboutP1Ar: '', aboutP1En: '',
  aboutP2Ar: '', aboutP2En: '',
  aboutP3Ar: '', aboutP3En: '',
  addressAr: '', addressEn: '',
  phone: '', email: '',
  showCareSection: true,
  showAgentsSection: true,
  showStatsSection: true,
  videos: [], products: [], customNavLinks: [],
  stats: [
    { id: 's1', value: 20, suffix: '+', labelAr: 'سنة خبرة', labelEn: 'Years Experience' },
    { id: 's2', value: 500, suffix: '+', labelAr: 'منتج دوائي', labelEn: 'Products' },
    { id: 's3', value: 1000, suffix: '+', labelAr: 'عميل موثوق', labelEn: 'Trusted Clients' },
    { id: 's4', value: 50, suffix: '+', labelAr: 'وكيل معتمد', labelEn: 'Certified Agents' },
  ],
  socialLinks: {},
};

interface UIState {
  landingConfig: LandingConfig;
  isLoadingConfig: boolean;
  isSavingConfig: boolean;
  
  fetchLandingConfig: () => Promise<void>;
  saveLandingConfig: (config: LandingConfig) => Promise<{ success: boolean; error?: string }>;
  updateLandingConfig: (partial: Partial<LandingConfig>) => void;
  uploadImage: (file: File, path: string) => Promise<string | null>;
}

export const useUIStore = create<UIState>((set, get) => ({
  landingConfig: defaultConfig,
  isLoadingConfig: false,
  isSavingConfig: false,

  fetchLandingConfig: async () => {
    set({ isLoadingConfig: true });
    try {
      const { data, error } = await supabase
        .from('public_landing_config')
        .select('landing_config')
        .eq('id', 'singleton')
        .single();
      
      if (!error && data?.landing_config) {
        set({ landingConfig: { ...defaultConfig, ...data.landing_config } });
      }
    } catch (err) {
      console.error('Failed to fetch config:', err);
    } finally {
      set({ isLoadingConfig: false });
    }
  },

  saveLandingConfig: async (config: LandingConfig) => {
    set({ isSavingConfig: true });
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          id: 'singleton',
          landing_config: config,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      set({ landingConfig: config });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      set({ isSavingConfig: false });
    }
  },

  updateLandingConfig: (partial) => {
    set(state => ({
      landingConfig: { ...state.landingConfig, ...partial }
    }));
  },

  uploadImage: async (file: File, path: string) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${path}/${Date.now()}.${fileExt}`;
      
      const { error } = await supabase.storage
        .from('public-assets')
        .upload(fileName, file, { upsert: true });

      if (error) throw error;

      const { data } = supabase.storage
        .from('public-assets')
        .getPublicUrl(fileName);

      return data.publicUrl;
    } catch (err) {
      console.error('Upload failed:', err);
      return null;
    }
  },
}));