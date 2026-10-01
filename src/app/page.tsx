'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Sidebar } from '@/components/sidebar';
import { AssetCenter } from '@/components/asset-center';
import { CreationCenter } from '@/components/creation-center';
import { PanoramaGraph } from '@/components/panorama-graph';
import { ProjectWizard } from '@/components/project-wizard';
import { motion, AnimatePresence } from 'framer-motion';
import { Archive, Network, PenTool } from 'lucide-react';
import { displayLabel, GENRE_LABELS, ja } from '@/lib/i18n';

interface Project {
  id: string;
  title: string;
  genre: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    chapters: number;
    characters: number;
    worldSettings: number;
  };
}

const MODULE_CONFIG = {
  creation: { label: ja.nav.creation, icon: PenTool, color: 'text-amber-400' },
  assets: { label: ja.nav.assets, icon: Archive, color: 'text-rose-400' },
  graph: { label: ja.nav.graph, icon: Network, color: 'text-teal-400' },
};

export default function NovelPlatform() {
  const { currentProjectId, setCurrentProjectId, coreModule } = useAppStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showWizard, setShowWizard] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        if (data.length > 0 && !currentProjectId) {
          setCurrentProjectId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch projects:', e);
    }
  }, [currentProjectId, setCurrentProjectId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleDeleteProject = async (id: string) => {
    try {
      const res = await fetch(`/api/projects?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== id));
        if (currentProjectId === id) {
          const remaining = projects.filter(p => p.id !== id);
          setCurrentProjectId(remaining.length > 0 ? remaining[0].id : null);
        }
      }
    } catch (e) {
      console.error('Failed to delete project:', e);
    }
  };

  const handleWizardComplete = (project: { id: string; title: string; genre: string; description: string }) => {
    setProjects(prev => [project as Project, ...prev]);
    setCurrentProjectId(project.id);
    setShowWizard(false);
  };

  const currentProject = projects.find(p => p.id === currentProjectId);

  const renderMainContent = () => {
    if (!currentProjectId) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
          <div className="text-6xl mb-6">📚</div>
          <h2 className="text-2xl font-bold text-foreground mb-2">小説創作Agentへようこそ</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            最初のプロジェクトを作成して、AI Agentと一緒に物語を書き始めましょう
          </p>
          <button
            onClick={() => setShowWizard(true)}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            + 新規プロジェクト
          </button>
        </div>
      );
    }

    switch (coreModule) {
      case 'creation':
        return <CreationCenter projectId={currentProjectId} />;
      case 'assets':
        return <AssetCenter projectId={currentProjectId} />;
      case 'graph':
        return <PanoramaGraph projectId={currentProjectId} />;
      default:
        return <CreationCenter projectId={currentProjectId} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        projects={projects}
        currentProjectId={currentProjectId}
        onSelectProject={setCurrentProjectId}
        onCreateProject={() => setShowWizard(true)}
        onDeleteProject={handleDeleteProject}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {currentProject && (
              <>
                <span className="text-sm font-medium text-foreground">{currentProject.title}</span>
                <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{displayLabel(GENRE_LABELS, currentProject.genre)}</span>
                {/* Module indicator */}
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  / {(() => { const cfg = MODULE_CONFIG[coreModule]; const Icon = cfg.icon; return <><Icon size={12} className={cfg.color} />{cfg.label}</>; })()}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentProjectId && (
              <a
                href={`/api/export?projectId=${currentProjectId}`}
                className="text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded hover:bg-secondary"
              >
                📥 TXT書き出し
              </a>
            )}
          </div>
        </header>

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={coreModule}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              {renderMainContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Project Wizard */}
      {showWizard && (
        <ProjectWizard
          onComplete={handleWizardComplete}
          onCancel={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}
