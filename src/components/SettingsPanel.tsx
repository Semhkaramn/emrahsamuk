"use client";

import { AISettings } from "@/lib/types";
import { Key, Sparkles, Image, Settings, Eye, EyeOff, Save, Loader2, CheckCircle2, Cloud } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";

interface SettingsPanelProps {
  disabled?: boolean;
}

export function SettingsPanel({ disabled }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AISettings>({
    openaiApiKey: "",
    enableSeoOptimization: true,
    enableImageEnhancement: true,
    imageStyle: "professional",
    cloudinaryCloudName: "",
    cloudinaryApiKey: "",
    cloudinaryApiSecret: "",
    cloudinaryFolder: "urunler",
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const originalSettings = useRef<AISettings | null>(null);

  const imageStyles = [
    { value: 'professional', label: 'Profesyonel', desc: 'Beyaz arka plan, stüdyo ışığı' },
    { value: 'lifestyle', label: 'Yaşam Tarzı', desc: 'Doğal ortam, sıcak ışık' },
    { value: 'minimal', label: 'Minimal', desc: 'Temiz, modern estetik' },
    { value: 'luxury', label: 'Lüks', desc: 'Premium, dramatik ışık' },
  ];

  // Load settings from API
  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        if (data.success) {
          setSettings(data.data);
          originalSettings.current = data.data;
        }
      } catch (error) {
        console.error("Settings load error:", error);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  // Check for changes
  useEffect(() => {
    if (originalSettings.current) {
      const changed = JSON.stringify(settings) !== JSON.stringify(originalSettings.current);
      setHasChanges(changed);
      if (changed) {
        setSaved(false);
      }
    }
  }, [settings]);

  // Save settings to API
  const saveSettings = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (data.success) {
        originalSettings.current = settings;
        setHasChanges(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error("Settings save error:", error);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const handleSettingsChange = useCallback((newSettings: AISettings) => {
    setSettings(newSettings);
  }, []);

  if (loading) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-zinc-400" />
          <h2 className="text-lg font-semibold">AI Ayarları</h2>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              Kaydedildi
            </span>
          )}
          <Button
            onClick={saveSettings}
            disabled={disabled || saving || !hasChanges}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </div>

      {/* API Key */}
      <div className="mb-6">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
          <Key className="w-4 h-4 text-amber-400" />
          OpenAI API Anahtarı
        </label>
        <div className="relative">
          <input
            type={showApiKey ? "text" : "password"}
            value={settings.openaiApiKey}
            onChange={(e) => handleSettingsChange({ ...settings, openaiApiKey: e.target.value })}
            disabled={disabled}
            placeholder="sk-..."
            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 disabled:opacity-50 pr-12"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          >
            {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          API anahtarınız veritabanında güvenli şekilde saklanır
        </p>
      </div>

      {/* Toggle Options */}
      <div className="space-y-4 mb-6">
        <ToggleOption
          icon={Sparkles}
          iconColor="text-purple-400"
          label="SEO Optimizasyonu"
          description="Ürün isimlerini AI ile SEO'ya uygun hale getir"
          checked={settings.enableSeoOptimization}
          onChange={(checked) => handleSettingsChange({ ...settings, enableSeoOptimization: checked })}
          disabled={disabled}
        />

        <ToggleOption
          icon={Image}
          iconColor="text-blue-400"
          label="Resim İyileştirme"
          description="Ürün resimlerini AI ile daha çekici hale getir"
          checked={settings.enableImageEnhancement}
          onChange={(checked) => handleSettingsChange({ ...settings, enableImageEnhancement: checked })}
          disabled={disabled}
        />
      </div>

      {/* Image Style Selection */}
      {settings.enableImageEnhancement && (
        <div>
          <label className="text-sm font-medium text-zinc-300 mb-3 block">
            Resim Stili
          </label>
          <div className="grid grid-cols-2 gap-2">
            {imageStyles.map((style) => (
              <button
                key={style.value}
                type="button"
                onClick={() => handleSettingsChange({ ...settings, imageStyle: style.value as AISettings['imageStyle'] })}
                disabled={disabled}
                className={`p-3 rounded-xl border text-left transition-all ${
                  settings.imageStyle === style.value
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                    : 'bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                } disabled:opacity-50`}
              >
                <div className="font-medium text-sm">{style.label}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{style.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cloudinary Settings */}
      <div className="mt-6 pt-6 border-t border-zinc-800">
        <div className="flex items-center gap-2 mb-4">
          <Cloud className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-semibold text-zinc-300">Cloudinary Ayarları</h3>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          Resimler Cloudinary&apos;ye yüklenir ve URL&apos;ler veritabanında saklanır
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">Cloud Name</label>
            <input
              type="text"
              value={settings.cloudinaryCloudName}
              onChange={(e) => handleSettingsChange({ ...settings, cloudinaryCloudName: e.target.value })}
              disabled={disabled}
              placeholder="your-cloud-name"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">API Key</label>
            <input
              type="text"
              value={settings.cloudinaryApiKey}
              onChange={(e) => handleSettingsChange({ ...settings, cloudinaryApiKey: e.target.value })}
              disabled={disabled}
              placeholder="123456789012345"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">API Secret</label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={settings.cloudinaryApiSecret}
                onChange={(e) => handleSettingsChange({ ...settings, cloudinaryApiSecret: e.target.value })}
                disabled={disabled}
                placeholder="abcdefghijklmnopqrstuvwxyz"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 disabled:opacity-50 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">Klasör Adı</label>
            <input
              type="text"
              value={settings.cloudinaryFolder}
              onChange={(e) => handleSettingsChange({ ...settings, cloudinaryFolder: e.target.value })}
              disabled={disabled}
              placeholder="urunler"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 disabled:opacity-50"
            />
            <p className="text-xs text-zinc-500 mt-1">
              Resimler bu klasöre yüklenecek (örn: urunler/URUN001_1.jpg)
            </p>
          </div>
        </div>
      </div>

      {/* Cost Warning */}
      {(settings.enableSeoOptimization || settings.enableImageEnhancement) && (
        <div className="mt-6 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <p className="text-xs text-amber-400">
            <strong>Maliyet Uyarısı:</strong> AI işlemleri OpenAI API kredisi kullanır.
            {settings.enableImageEnhancement && " DALL-E 3 resim başına ~$0.04 ücret alır."}
            {settings.enableSeoOptimization && " GPT-4o-mini SEO için çok düşük maliyetlidir."}
          </p>
        </div>
      )}

      {/* Unsaved changes warning */}
      {hasChanges && (
        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <p className="text-xs text-amber-400">
            Kaydedilmemiş değişiklikleriniz var. Kaydetmek için &quot;Kaydet&quot; butonuna tıklayın.
          </p>
        </div>
      )}
    </div>
  );
}

interface ToggleOptionProps {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function ToggleOption({
  icon: Icon,
  iconColor,
  label,
  description,
  checked,
  onChange,
  disabled
}: ToggleOptionProps) {
  return (
    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
      checked
        ? 'bg-zinc-800/70 border-zinc-700'
        : 'bg-zinc-900/30 border-zinc-800 hover:border-zinc-700'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <div className={`p-1.5 rounded-lg ${checked ? 'bg-emerald-500/10' : 'bg-zinc-800'}`}>
        <Icon className={`w-4 h-4 ${checked ? iconColor : 'text-zinc-500'}`} />
      </div>
      <div className="flex-1">
        <div className="font-medium text-sm text-zinc-200">{label}</div>
        <div className="text-xs text-zinc-500">{description}</div>
      </div>
      <div className="pt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <div className={`w-10 h-6 rounded-full transition-colors ${
          checked ? 'bg-emerald-500' : 'bg-zinc-700'
        }`}>
          <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform mt-1 ${
            checked ? 'translate-x-5 ml-0' : 'translate-x-1'
          }`} />
        </div>
      </div>
    </label>
  );
}
