"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { LoginPage } from "@/components/LoginPage";
import { Dashboard } from "@/components/Dashboard";
import { ExcelUploader } from "@/components/ExcelUploader";
import { ProductDataGrid } from "@/components/ProductDataGrid";
import { SettingsPanel } from "@/components/SettingsPanel";
import { NameProcessingPanel } from "@/components/NameProcessingPanel";
import { ImageProcessingPanel } from "@/components/ImageProcessingPanel";
import { CategoryProcessingPanel } from "@/components/CategoryProcessingPanel";
import { ExportPanel } from "@/components/ExportPanel";
import {
  LayoutDashboard,
  Upload,
  Package,
  Download,
  Settings,
  Sparkles,
  Image as ImageIcon,
  FolderTree,
  Menu,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Loader2,
} from "lucide-react";

type ActivePage = "dashboard" | "name-process" | "image-process" | "category-process" | "upload" | "products" | "export" | "settings";

interface NavItem {
  id: ActivePage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  category?: string;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Genel bakış ve istatistikler" },
  { id: "name-process", label: "İsim Yapma", icon: Sparkles, description: "AI ile isim değiştirme", category: "İşlemler" },
  { id: "image-process", label: "Resim Yapma", icon: ImageIcon, description: "Cloudinary'ye yükleme", category: "İşlemler" },
  { id: "category-process", label: "Kategori Yapma", icon: FolderTree, description: "AI ile kategori belirleme", category: "İşlemler" },
  { id: "upload", label: "Yükle", icon: Upload, description: "Excel dosyası yükleme", category: "Veri" },
  { id: "products", label: "Ürünler", icon: Package, description: "Ürün listesi ve detayları", category: "Veri" },
  { id: "export", label: "Export", icon: Download, description: "Veri dışa aktarma", category: "Veri" },
  { id: "settings", label: "Ayarlar", icon: Settings, description: "Sistem ayarları" },
];

export default function Home() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
          <p className="text-zinc-400">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const activeNavItem = navItems.find((item) => item.id === activePage);

  const renderPageContent = () => {
    switch (activePage) {
      case "dashboard":
        return <Dashboard />;
      case "name-process":
        return <NameProcessingPanel />;
      case "image-process":
        return <ImageProcessingPanel />;
      case "category-process":
        return <CategoryProcessingPanel />;
      case "upload":
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Upload className="w-6 h-6 text-emerald-400" />
                Excel Dosyası Yükle
              </h2>
              <p className="text-sm text-zinc-500 mt-1">
                Aşağıdaki Excel dosyalarını yükleyerek ürün verilerinizi sisteme aktarın
              </p>
            </div>
            <ExcelUploader />
          </div>
        );
      case "products":
        return (
          <ProductDataGrid
            onProductSelect={() => {
              // Product selection handler - can be expanded for modal/detail view
            }}
            onProductEdit={() => {
              // Product edit handler - can be expanded for edit modal
            }}
          />
        );
      case "export":
        return <ExportPanel />;
      case "settings":
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Settings className="w-6 h-6 text-emerald-400" />
                Ayarlar
              </h2>
              <p className="text-sm text-zinc-500 mt-1">
                AI ve işleme ayarlarını yapılandırın
              </p>
            </div>
            <div className="max-w-xl">
              <SettingsPanel />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // Group nav items by category
  const groupedNavItems = navItems.reduce((acc, item) => {
    const category = item.category || "Genel";
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50
          ${sidebarOpen ? "w-64" : "w-20"}
          ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          bg-zinc-900 border-r border-zinc-800
          flex flex-col transition-all duration-300 ease-in-out
        `}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shrink-0">
              <Package className="w-6 h-6 text-white" />
            </div>
            {sidebarOpen && (
              <div className="overflow-hidden">
                <h1 className="text-lg font-bold truncate">Ürün Yönetim</h1>
                <p className="text-xs text-zinc-500 truncate">AI SEO + Resim</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {Object.entries(groupedNavItems).map(([category, items]) => (
            <div key={category}>
              {sidebarOpen && category !== "Genel" && (
                <p className="px-3 py-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  {category}
                </p>
              )}
              <div className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activePage === item.id;

                  // Color mapping for process pages
                  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
                    "name-process": { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
                    "image-process": { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
                    "category-process": { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20" },
                  };
                  const colors = colorMap[item.id];

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActivePage(item.id);
                        setMobileSidebarOpen(false);
                      }}
                      className={`
                        w-full flex items-center gap-3 px-3 py-3 rounded-xl
                        transition-all duration-200 group
                        ${isActive
                          ? colors
                            ? `${colors.bg} ${colors.text} border ${colors.border}`
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                        }
                      `}
                    >
                      <Icon className={`w-5 h-5 shrink-0 ${isActive && colors ? colors.text : isActive ? "text-emerald-400" : ""}`} />
                      {sidebarOpen && (
                        <>
                          <div className="flex-1 text-left overflow-hidden">
                            <div className="font-medium truncate">{item.label}</div>
                            <div className="text-xs text-zinc-500 truncate">{item.description}</div>
                          </div>
                          {isActive && (
                            <ChevronRight className={`w-4 h-4 shrink-0 ${colors ? colors.text : "text-emerald-400"}`} />
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Toggle Button - Always Visible */}
        <div className="p-3 border-t border-zinc-800">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`
              w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg
              transition-all duration-200 group
              ${sidebarOpen
                ? "bg-zinc-800 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 border border-transparent hover:border-red-500/20"
                : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
              }
            `}
            title={sidebarOpen ? "Menüyü Daralt" : "Menüyü Genişlet"}
          >
            {sidebarOpen ? (
              <>
                <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                <span className="text-sm font-medium">Menüyü Daralt</span>
              </>
            ) : (
              <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
        </div>
      </aside>

      {/* Floating Toggle Button for Collapsed State */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed left-16 top-1/2 -translate-y-1/2 z-40 hidden md:flex
                     w-6 h-12 items-center justify-center
                     bg-zinc-800 hover:bg-emerald-500/20 border border-zinc-700 hover:border-emerald-500/30
                     rounded-r-lg transition-all duration-200 group"
          title="Menüyü Genişlet"
        >
          <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-emerald-400 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="px-6 py-4 flex items-center gap-4">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Page Title */}
            <div className="flex items-center gap-3 flex-1">
              {activeNavItem && (
                <>
                  <div className={`p-2 rounded-lg ${
                    activePage === "name-process" ? "bg-purple-500/10" :
                    activePage === "image-process" ? "bg-blue-500/10" :
                    activePage === "category-process" ? "bg-orange-500/10" :
                    "bg-emerald-500/10"
                  }`}>
                    <activeNavItem.icon className={`w-5 h-5 ${
                      activePage === "name-process" ? "text-purple-400" :
                      activePage === "image-process" ? "text-blue-400" :
                      activePage === "category-process" ? "text-orange-400" :
                      "text-emerald-400"
                    }`} />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold">{activeNavItem.label}</h1>
                    <p className="text-xs text-zinc-500">{activeNavItem.description}</p>
                  </div>
                </>
              )}
            </div>

            {/* Logout Button */}
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 border border-zinc-700 hover:border-red-500/30 transition-all duration-200"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium hidden sm:inline">Çıkış Yap</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">
            {renderPageContent()}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-zinc-800 bg-zinc-900/30">
          <div className="px-6 py-3">
            <p className="text-center text-xs text-zinc-600">
              Ürün Yönetim Sistemi v2.0 - AI-Powered SEO & Image Enhancement
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
