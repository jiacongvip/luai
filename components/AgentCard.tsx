
import React from 'react';
import { Agent, Language } from '../types';
import { Bot, Star, ArrowRight } from 'lucide-react';
import { translations } from '../utils/translations';

interface AgentCardProps {
  agent: Agent;
  onSelect: (agent: Agent) => void;
  language: Language;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onSelect, language }) => {
  // Safe access
  const t = translations[language]?.marketplace || translations['en'].marketplace;
  
  // Use localized fields if available, otherwise fallback to default
  const role = language === 'zh' && agent.role_zh ? agent.role_zh : agent.role;
  const description = language === 'zh' && agent.description_zh ? agent.description_zh : agent.description;
  const categoryLabel = (t.filters && t.filters[agent.category]) ? t.filters[agent.category] : agent.category;

  return (
    <div className="bg-surface border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all duration-300 group flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-background flex items-center justify-center border border-border overflow-hidden">
             {agent.avatar ? (
               <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
             ) : (
               <Bot className="text-textSecondary" />
             )}
          </div>
          <div>
            <h3 className="font-bold text-textMain group-hover:text-primary transition-colors">{agent.name}</h3>
            <div className="flex gap-1">
              <span className="text-xs px-2 py-0.5 rounded-full bg-background text-textMain border border-border">
                {categoryLabel}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-background text-textSecondary border border-border">
                {role}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1 text-yellow-500 text-xs font-bold mb-1">
            <Star size={12} fill="currentColor" />
            <span>4.9</span>
          </div>
          <span className="text-xs text-textSecondary">{agent.pricePerMessage} {t.perMsg}</span>
        </div>
      </div>
      
      <p className="text-textSecondary text-sm mb-4 line-clamp-2 flex-grow">
        {description}
      </p>

      <button 
        onClick={() => onSelect(agent)}
        className="mt-auto w-full py-2 bg-background hover:bg-background/80 text-textMain rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 group-hover:bg-primary group-hover:text-white"
      >
        {t.chatNow}
        <ArrowRight size={14} />
      </button>
    </div>
  );
};

export default AgentCard;
