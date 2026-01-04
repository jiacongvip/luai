
import React, { useState, useEffect } from 'react';
import { Search, Filter } from 'lucide-react';
import AgentCard from '../components/AgentCard';
import { Agent, AppRoute, Language } from '../types';
import { translations } from '../utils/translations';
import { storage } from '../utils/storage';

interface MarketplaceProps {
  onSelectAgent: (agent: Agent) => void;
  onNavigate: (route: AppRoute) => void;
  language: Language;
  agents: Agent[]; // Agents passed from App state
}

const Marketplace: React.FC<MarketplaceProps> = ({ onSelectAgent, onNavigate, language, agents }) => {
  const [filter, setFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  
  // Safe Translation Access
  const t = translations[language]?.marketplace || translations['en'].marketplace;

  useEffect(() => {
      const storedCategories = storage.loadAgentCategories();
      setCategories(['All', ...storedCategories]);
  }, []);

  const filteredAgents = agents.filter(agent => {
    const matchesFilter = filter === 'All' || agent.category === filter;
    const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          agent.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (agent.description_zh && agent.description_zh.includes(searchTerm));
    return matchesFilter && matchesSearch;
  });

  // Helper to translate category if it's a standard one, else return custom name
  const getCategoryLabel = (cat: string) => {
      if (cat === 'All') return t.filters.All;
      // If the translation key exists in t.filters, use it, otherwise use cat as is
      return (t.filters as any)[cat] || cat;
  };

  return (
    <div className="p-6 md:p-10 min-h-full bg-background">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-textMain mb-2">{t.title}</h1>
            <p className="text-textSecondary max-w-xl">
              {t.subtitle}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary" size={18} />
            <input 
              type="text" 
              placeholder={t.searchPlaceholder} 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2.5 text-textMain placeholder-textSecondary focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                  ${filter === cat 
                    ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                    : 'bg-surface border border-border text-textSecondary hover:text-textMain hover:bg-background'}`}
              >
                {getCategoryLabel(cat)}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAgents.map(agent => (
            <AgentCard 
              key={agent.id} 
              agent={agent} 
              onSelect={(a) => {
                 onSelectAgent(a);
                 onNavigate(AppRoute.CHAT);
              }}
              language={language}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Marketplace;
