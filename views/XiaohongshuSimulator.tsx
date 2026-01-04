
import React, { useState, useEffect, useRef } from 'react';
import { Language, User, UserProfileData } from '../types';
import { translations } from '../utils/translations';
import { 
    LayoutTemplate, Image as ImageIcon, Heart, Star, MessageCircle, Share2, 
    MoreHorizontal, ChevronLeft, Search, Hash, Upload, X, MapPin, 
    Smile, Plus, User as UserIcon, Sparkles, MessageSquarePlus, RefreshCw, Dice5, Palette, 
    LayoutGrid, Smartphone, Filter, Save, Download, ArrowDownCircle, Check, Trash2, Edit, Wand2, Loader2, Camera,
    BookPlus, TrendingUp, AlertTriangle
} from 'lucide-react';
import { generateAgentResponse, generateImage, analyzeDraft, DraftAnalysisResult } from '../services/geminiService';
import html2canvas from 'html2canvas';

interface XiaohongshuSimulatorProps {
    language: Language;
    user: User;
    initialData?: {
        title?: string;
        content?: string;
    };
    compact?: boolean; 
    onUpdateProjectData?: (projectId: string, newData: UserProfileData) => void; 
}

interface FakeComment {
    user: string;
    content: string;
    likes: number;
    avatarColor: string;
}

interface FeedItem {
    id: string;
    title: string;
    image: string;
    avatar: string;
    name: string;
    likes: string;
    isUserDraft?: boolean;
    aspectRatio?: string; 
    isVideo?: boolean;
    content?: string; 
    savedAt?: number;
}

const COMMON_EMOJIS = ['🔥','❤️','✨','👍','😭','😂','🥰','‼️','👀','💰','🎉','✅','❌','🤔','👇'];

type NicheType = 'mix' | 'tech' | 'beauty' | 'food';

const MOCK_DATA_POOLS: Record<NicheType, FeedItem[]> = {
    mix: [
        { id: 'm1', title: 'My 10min morning routine ☕️', image: 'https://picsum.photos/300/400?random=101', avatar: 'https://picsum.photos/50/50?random=1', name: 'SophieL', likes: '12k', aspectRatio: 'aspect-[3/4]' },
        { id: 'm2', title: 'Hidden gems in Tokyo you must visit', image: 'https://picsum.photos/300/350?random=103', avatar: 'https://picsum.photos/50/50?random=3', name: 'Traveler_X', likes: '432', aspectRatio: 'aspect-[1/1]' },
        { id: 'm3', title: 'Why I stopped using Python 🐍', image: 'https://picsum.photos/300/500?random=102', avatar: 'https://picsum.photos/50/50?random=2', name: 'DevDave', likes: '5.4k', aspectRatio: 'aspect-[9/16]' },
        { id: 'm4', title: 'OOTD: Summer vibes ☀️', image: 'https://picsum.photos/300/450?random=104', avatar: 'https://picsum.photos/50/50?random=4', name: 'Fashionista', likes: '2.1w', aspectRatio: 'aspect-[3/4]' },
        { id: 'm5', title: 'Healthy salad recipe 🥗', image: 'https://picsum.photos/300/300?random=105', avatar: 'https://picsum.photos/50/50?random=5', name: 'ChefJen', likes: '998', aspectRatio: 'aspect-[1/1]' },
        { id: 'm6', title: 'Cat being funny 😂', image: 'https://picsum.photos/300/400?random=106', avatar: 'https://picsum.photos/50/50?random=6', name: 'CatLover', likes: '15k', aspectRatio: 'aspect-[3/4]', isVideo: true },
    ],
    tech: [
        { id: 't1', title: 'iPhone 15 Pro Max Review: Worth it?', image: 'https://picsum.photos/300/400?random=201', avatar: 'https://picsum.photos/50/50?random=21', name: 'TechGuru', likes: '3.4k', aspectRatio: 'aspect-[3/4]' },
        { id: 't2', title: 'My Desk Setup 2024 🖥️', image: 'https://picsum.photos/300/300?random=202', avatar: 'https://picsum.photos/50/50?random=22', name: 'SetupWars', likes: '12k', aspectRatio: 'aspect-[1/1]' },
        { id: 't3', title: 'Coding Tips for Beginners', image: 'https://picsum.photos/300/500?random=203', avatar: 'https://picsum.photos/50/50?random=23', name: 'CodeLife', likes: '890', aspectRatio: 'aspect-[9/16]' },
        { id: 't4', title: 'Best AI Tools for Productivity', image: 'https://picsum.photos/300/400?random=204', avatar: 'https://picsum.photos/50/50?random=24', name: 'AI_Insider', likes: '5.6k', aspectRatio: 'aspect-[3/4]' },
        { id: 't5', title: 'Mechanical Keyboard Sound Test ⌨️', image: 'https://picsum.photos/300/350?random=205', avatar: 'https://picsum.photos/50/50?random=25', name: 'ClickyClack', likes: '2.1k', aspectRatio: 'aspect-[1/1]', isVideo: true },
    ],
    beauty: [
        { id: 'b1', title: 'Clean Girl Makeup Tutorial ✨', image: 'https://picsum.photos/300/450?random=301', avatar: 'https://picsum.photos/50/50?random=31', name: 'BeautyBySue', likes: '22k', aspectRatio: 'aspect-[3/4]' },
        { id: 'b2', title: 'Skincare Routine for Glass Skin', image: 'https://picsum.photos/300/400?random=302', avatar: 'https://picsum.photos/50/50?random=32', name: 'GlowUp', likes: '8.9k', aspectRatio: 'aspect-[3/4]' },
        { id: 'b3', title: 'ZARA Haul: Spring Collection', image: 'https://picsum.photos/300/500?random=303', avatar: 'https://picsum.photos/50/50?random=33', name: 'FashionDaily', likes: '4.5k', aspectRatio: 'aspect-[9/16]', isVideo: true },
        { id: 'b4', title: 'Dyson Airwrap vs Shark Flexstyle', image: 'https://picsum.photos/300/300?random=304', avatar: 'https://picsum.photos/50/50?random=34', name: 'HairGoals', likes: '15k', aspectRatio: 'aspect-[1/1]' },
        { id: 'b5', title: 'My fav lip combos 💄', image: 'https://picsum.photos/300/400?random=305', avatar: 'https://picsum.photos/50/50?random=35', name: 'LipQueen', likes: '3.2k', aspectRatio: 'aspect-[3/4]' },
    ],
    food: [
        { id: 'f1', title: 'Hidden Cafe in Shanghai ☕️', image: 'https://picsum.photos/300/400?random=401', avatar: 'https://picsum.photos/50/50?random=41', name: 'CafeHopper', likes: '5.6k', aspectRatio: 'aspect-[3/4]' },
        { id: 'f2', title: 'Easy 15min Pasta Recipe 🍝', image: 'https://picsum.photos/300/300?random=402', avatar: 'https://picsum.photos/50/50?random=42', name: 'HomeCook', likes: '12k', aspectRatio: 'aspect-[1/1]' },
        { id: 'f3', title: 'Street Food Tour: Bangkok', image: 'https://picsum.photos/300/500?random=403', avatar: 'https://picsum.photos/50/50?random=43', name: 'FoodTravel', likes: '2.3k', aspectRatio: 'aspect-[9/16]', isVideo: true },
        { id: 'f4', title: 'Best Brunch Spots', image: 'https://picsum.photos/300/400?random=404', avatar: 'https://picsum.photos/50/50?random=44', name: 'BrunchBabe', likes: '8.9k', aspectRatio: 'aspect-[3/4]' },
        { id: 'f5', title: 'Omakase Experience 🍣', image: 'https://picsum.photos/300/350?random=405', avatar: 'https://picsum.photos/50/50?random=45', name: 'LuxEats', likes: '1.2k', aspectRatio: 'aspect-[1/1]' },
    ]
};

const SAVED_POSTS_KEY = 'nexus_sim_saved_posts';

const XiaohongshuSimulator: React.FC<XiaohongshuSimulatorProps> = ({ language, user, initialData, compact = false, onUpdateProjectData }) => {
    // Access safely
    const t = (translations[language] as any)?.simulator || (translations['en'] as any).simulator;
    const phoneRef = useRef<HTMLDivElement>(null);
    
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [authorName, setAuthorName] = useState(user.name);
    const [authorAvatar, setAuthorAvatar] = useState(user.avatar);
    
    // Fake stats
    const [likes, setLikes] = useState('1.2w');
    const [collects, setCollects] = useState('5.6k');
    const [comments, setComments] = useState('886');

    // UI State
    const [viewMode, setViewMode] = useState<'detail' | 'list'>('detail');
    const [activeNiche, setActiveNiche] = useState<NicheType | 'saved'>('mix');
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
    const [isGeneratingComments, setIsGeneratingComments] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [isAiParsing, setIsAiParsing] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false); // NEW
    const [analysisResult, setAnalysisResult] = useState<DraftAnalysisResult | null>(null); // NEW
    const [showSaveSuccess, setShowSaveSuccess] = useState(false);
    const [showExampleSaved, setShowExampleSaved] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    
    // Get Active Context
    const activeProject = user.projects?.find(p => p.id === user.activeProjectId);

    // Saved Posts State
    const [savedPosts, setSavedPosts] = useState<FeedItem[]>(() => {
        try {
            const saved = localStorage.getItem(SAVED_POSTS_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    });

    // Dynamic Comments State
    const [commentsList, setCommentsList] = useState<FakeComment[]>([
        { user: 'Momo', content: 'This looks amazing! Can you share the prompt? 😍', likes: 24, avatarColor: 'bg-purple-100' },
        { user: 'TechGuru', content: 'Saved! Useful info.', likes: 5, avatarColor: 'bg-blue-100' }
    ]);

    // Persist saved posts
    useEffect(() => {
        localStorage.setItem(SAVED_POSTS_KEY, JSON.stringify(savedPosts));
    }, [savedPosts]);

    // INTELLIGENT AUTO-PARSING EFFECT (Regex based - fast)
    useEffect(() => {
        if (initialData?.content && !title && !content) {
            parseAndPopulate(initialData.content, initialData.title);
        }
    }, [initialData]);

    const parseAndPopulate = (text: string, providedTitle?: string) => {
        let extractedTitle = '';
        let extractedContent = text;

        // Smart Parsing: Attempt to find various Title markers
        const explicitTitleRegex = /(?:^|\n)(?:\*\*|#|##)?\s*(?:Title|Heading|标题|Topic)\s*(?:\*\*|:)?\s*[:：]?\s*(.+?)(?:\n|$)/i;
        const titleMatch = text.match(explicitTitleRegex);

        if (titleMatch) {
            extractedTitle = titleMatch[1].trim().replace(/\*\*/g, ''); 
            extractedContent = text.replace(titleMatch[0], '').trim();
        } else {
            const headerRegex = /^(?:#+\s|\*\*)(.+?)(?:\*\*|\n|$)/;
            const firstLineMatch = text.match(headerRegex);
            
            if (firstLineMatch) {
                extractedTitle = firstLineMatch[1].trim();
                extractedContent = text.substring(firstLineMatch[0].length).trim();
            } else {
                const lines = text.split('\n');
                if (lines[0].trim().length > 0 && lines[0].trim().length < 50 && lines.length > 1) {
                    extractedTitle = lines[0].trim().replace(/\*\*/g, '');
                    extractedContent = lines.slice(1).join('\n').trim();
                }
            }
        }

        extractedContent = extractedContent.replace(/^(?:\*\*|#)?\s*(?:Content|Body|正文)\s*(?:\*\*|:)?\s*[:：]?\s*/i, '');

        if (providedTitle && providedTitle !== 'Draft' && providedTitle !== 'Draft from Chat') {
            setTitle(providedTitle);
        } else if (extractedTitle) {
            setTitle(extractedTitle);
        } else {
            setTitle(providedTitle || '');
        }

        setContent(extractedContent);
    };

    // --- NEW: ANALYZE DRAFT ---
    const handleAnalyzeDraft = async () => {
        if (!title && !content) return;
        setIsAnalyzing(true);
        setAnalysisResult(null);
        try {
            const result = await analyzeDraft(title, content, language);
            setAnalysisResult(result);
        } catch (e) {
            console.error("Draft analysis failed", e);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const getGradeColor = (grade: string) => {
        switch (grade) {
            case 'S': return 'text-purple-500 bg-purple-100 border-purple-200';
            case 'A': return 'text-green-500 bg-green-100 border-green-200';
            case 'B': return 'text-yellow-500 bg-yellow-100 border-yellow-200';
            case 'C': return 'text-orange-500 bg-orange-100 border-orange-200';
            default: return 'text-red-500 bg-red-100 border-red-200';
        }
    };

    const handleSaveAsExample = () => {
        if (!activeProject || !onUpdateProjectData) return;
        if (!title && !content) return;

        const currentExamples = (activeProject.data._successful_examples_ as string[]) || [];
        const newExample = `Title: ${title}\nContent: ${content}`;
        
        // Update Project Context
        const updatedData = {
            ...activeProject.data,
            _successful_examples_: [...currentExamples, newExample]
        };
        
        onUpdateProjectData(activeProject.id, updatedData);
        
        setShowExampleSaved(true);
        setTimeout(() => setShowExampleSaved(false), 2000);
    };

    // --- NEW: AI SMART PARSE ---
    const handleAiParse = async () => {
        const textToParse = initialData?.content || content;
        if (!textToParse) return;

        setIsAiParsing(true);
        try {
            const prompt = `
                Analyze the provided text and extract a "Title" and "Body Content" for a social media post (Xiaohongshu/RedNote style).
                
                Input Text:
                """
                ${textToParse.substring(0, 3000)}
                """
                
                Instructions:
                1. Identify the most likely Title. If multiple options/schemes (e.g. "Option 1", "Option 2") are present, CHOOSE THE FIRST ONE (Option 1) unless Option 1 is clearly inferior.
                2. Extract the Body Content corresponding to that title. Remove any labels like "Title:", "Content:", "Option 1:", "正文:", "标题:".
                3. Remove conversational filler (e.g. "Here are 3 options", "Hope this helps", "Sure!").
                4. Return strictly valid JSON: { "title": "...", "content": "..." }
            `;

            let result = '';
            await generateAgentResponse(prompt, '', (text) => result = text, 'gemini-3-flash-preview');
            
            // Clean and Parse
            const jsonStr = result.replace(/```json/g, '').replace(/```/g, '').trim();
            try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.title) setTitle(parsed.title);
                if (parsed.content) setContent(parsed.content);
                
                // Auto trigger image if none exists
                if (images.length === 0) {
                     handleGenerateImage(parsed.title, parsed.content);
                }
            } catch (e) {
                console.error("JSON parse failed during AI extract", e);
            }

        } catch (e) {
            console.error(e);
        } finally {
            setIsAiParsing(false);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const filesArray = Array.from(e.target.files);
            const newUrls = filesArray.map(file => URL.createObjectURL(file as Blob));
            setImages(prev => [...prev, ...newUrls]);
        }
    };

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
        if (currentImageIndex >= index && currentImageIndex > 0) {
            setCurrentImageIndex(currentImageIndex - 1);
        }
    };

    const handleSavePost = () => {
        if (!title && !content && images.length === 0) return;
        
        const newPost: FeedItem = {
            id: `saved-${Date.now()}`,
            title: title || 'Untitled Draft',
            content: content,
            image: images.length > 0 ? images[0] : '',
            avatar: authorAvatar,
            name: authorName,
            likes: likes,
            aspectRatio: 'aspect-[3/4]',
            isUserDraft: true,
            savedAt: Date.now()
        };

        setSavedPosts(prev => [newPost, ...prev]);
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 2000);
    };

    const handleDownload = async () => {
        if (!phoneRef.current) return;
        setIsDownloading(true);
        try {
            const canvas = await html2canvas(phoneRef.current, {
                useCORS: true,
                backgroundColor: null,
                scale: 2 // High res
            });
            const link = document.createElement('a');
            link.download = `nexus-rednote-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (e) {
            console.error("Export failed", e);
            alert("Export failed. Please check console.");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDeleteSaved = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('Delete this draft?')) {
            setSavedPosts(prev => prev.filter(p => p.id !== id));
        }
    };

    const handleLoadSavedPost = (item: FeedItem) => {
        setTitle(item.title);
        setContent(item.content || '');
        if (item.image) setImages([item.image]);
        setLikes(item.likes);
        setAuthorName(item.name);
        setViewMode('detail');
        setActiveNiche('mix'); 
    };

    const handleImportFromChat = () => {
        if (initialData?.content) {
            parseAndPopulate(initialData.content, initialData.title);
        }
    };

    // --- AI FUNCTIONS ---

    const handleGenerateCopy = async () => {
        if (!aiPrompt.trim()) return;
        setIsGeneratingCopy(true);
        setIsGeneratingImage(true); 
        
        let productContext = '';
        if (activeProject && activeProject.data) {
            const { product_name, industry, highlights } = activeProject.data;
            if (product_name) productContext += `Product: ${product_name}. `;
            if (industry) productContext += `Industry: ${industry}. `;
            if (highlights) productContext += `Highlights: ${highlights}. `;
        }

        const prompt = `
            Act as a popular Xiaohongshu (Little Red Book) content creator.
            Topic: ${aiPrompt}
            Context: ${productContext}
            Language: ${language === 'zh' ? 'Chinese (Simplified)' : 'English (with Chinese slang if appropriate)'}
            
            Instructions:
            1. Write a catchy TITLE (max 20 chars).
            2. Write the CONTENT (max 300 words). Use lots of emojis. Use line breaks. 
            3. Use authentic Xiaohongshu slang (e.g. 绝绝子, 宝子们, yyds) if Chinese.
            4. Include 3-5 hashtags at the end.
            
            Output format:
            TITLE: [Title here]
            CONTENT: [Content here]
        `;

        try {
            let result = '';
            await generateAgentResponse(prompt, '', (text) => result = text);
            
            const titleMatch = result.match(/TITLE:\s*(.*)/);
            const contentMatch = result.split(/CONTENT:\s*/)[1];

            const newTitle = titleMatch ? titleMatch[1].trim() : '';
            const newContent = contentMatch ? contentMatch.trim() : '';

            if (newTitle) setTitle(newTitle);
            if (newContent) setContent(newContent);
            
            handleGenerateComments(newContent || aiPrompt);
            await handleGenerateImage(newTitle, newContent);

        } catch (e) {
            console.error(e);
            setIsGeneratingImage(false); 
        } finally {
            setIsGeneratingCopy(false);
        }
    };

    const handleGenerateComments = async (contextText: string = content) => {
        setIsGeneratingComments(true);
        const prompt = `
            Act as varied Xiaohongshu users reacting to a post about: "${contextText.substring(0, 100)}...".
            Generate 4 realistic comments.
            Output strictly as valid JSON array of objects: [{"user": "Name", "content": "Comment text", "likes": number}]
        `;

        try {
            let result = '';
            await generateAgentResponse(prompt, '', (text) => result = text);
            const jsonStr = result.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(jsonStr);
            
            if (Array.isArray(parsed)) {
                const newComments = parsed.map((c: any) => ({
                    user: c.user,
                    content: c.content,
                    likes: c.likes || Math.floor(Math.random() * 50),
                    avatarColor: `bg-${['red','blue','green','yellow','purple','pink'][Math.floor(Math.random()*6)]}-100`
                }));
                setCommentsList(newComments);
                setComments((800 + Math.floor(Math.random() * 200)).toString());
            }
        } catch (e) {
            console.error("Comment gen error", e);
        } finally {
            setIsGeneratingComments(false);
        }
    };

    const handleGenerateImage = async (overrideTitle?: string, overrideContent?: string) => {
        const currentTitle = overrideTitle || title;
        const currentContent = overrideContent || content;
        const userPrompt = aiPrompt;

        if (!currentTitle && !currentContent && !userPrompt) {
            setIsGeneratingImage(false);
            return;
        }

        setIsGeneratingImage(true);
        try {
            let contextStr = '';
            if (activeProject && activeProject.data) {
                const { product_name, industry, highlights, target_audience } = activeProject.data;
                if (product_name) contextStr += `Product: ${product_name}. `;
                if (industry) contextStr += `Industry Context: ${industry}. `;
                if (target_audience) contextStr += `Target Audience Style: ${target_audience}. `;
            }

            const subject = userPrompt || currentTitle;
            const aestheticPrompt = `
                High quality lifestyle photography for social media (Xiaohongshu style).
                Subject: ${contextStr} ${subject}
                Mood/Scene: ${currentContent.substring(0, 100)}...
                Style: Aesthetic, soft lighting, realistic, high resolution, trendy.
                No text overlays.
            `;

            const base64Image = await generateImage(aestheticPrompt);
            if (base64Image) {
                setImages(prev => [base64Image, ...prev]);
            }
        } catch (e) {
            console.error("Image generation error", e);
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const handleRandomizePersona = () => {
        const names = ['Momo', 'TravelWithMe', 'FoodieJane', 'TechBro', 'DailyLife', 'StudyBuddy'];
        const randomName = names[Math.floor(Math.random() * names.length)];
        setAuthorName(randomName);
        setAuthorAvatar(`https://picsum.photos/200/200?random=${Date.now()}`);
        setLikes((Math.random() * 50).toFixed(1) + 'w');
        setCollects((Math.random() * 20).toFixed(1) + 'k');
    };

    const insertEmoji = (emoji: string) => {
        setContent(prev => prev + emoji);
    };

    const renderContent = (text: string) => {
        if (!text) return null;
        const parts = text.split(/(#\S+)/g);
        return parts.map((part, i) => {
            if (part.startsWith('#')) {
                return <span key={i} className="text-[#13386c] mr-1 cursor-pointer">{part}</span>;
            }
            return part;
        });
    };

    const renderFeed = () => {
        const userDraftItem: FeedItem = {
            id: 'draft',
            title: title || 'Your Title Here',
            image: images.length > 0 ? images[0] : '',
            avatar: authorAvatar,
            name: authorName,
            likes: likes,
            isUserDraft: true,
            aspectRatio: 'aspect-[3/4]'
        };

        let feedItems: FeedItem[] = [];
        
        if (activeNiche === 'saved') {
            feedItems = savedPosts;
        } else {
            const currentPool = MOCK_DATA_POOLS[activeNiche as NicheType] || MOCK_DATA_POOLS['mix'];
            feedItems = [currentPool[0], userDraftItem, ...currentPool.slice(1)];
        }

        return (
            <div className="bg-gray-50 flex-1 overflow-y-auto scrollbar-hide pb-20">
                <div className="bg-white p-3 sticky top-0 z-10 flex items-center gap-3 shadow-sm">
                    <div className="flex-1 bg-gray-100 rounded-full h-8 flex items-center px-3 text-xs text-gray-400">
                        <Search size={14} className="mr-2"/> Search
                    </div>
                    <MoreHorizontal size={20} className="text-gray-600"/>
                </div>

                <div className="flex justify-around bg-white pb-2 text-sm font-bold text-gray-400 border-b border-gray-100">
                    <span 
                        onClick={() => setActiveNiche('mix')}
                        className={`pb-1 cursor-pointer transition-colors ${activeNiche !== 'saved' ? 'text-black border-b-2 border-[#ff2442]' : 'hover:text-gray-600'}`}
                    >
                        Explore
                    </span>
                    <span className="cursor-pointer hover:text-gray-600">Local</span>
                    <span className="cursor-pointer hover:text-gray-600">Follow</span>
                    <span 
                        onClick={() => setActiveNiche('saved')}
                        className={`pb-1 cursor-pointer flex items-center gap-1 transition-colors ${activeNiche === 'saved' ? 'text-black border-b-2 border-[#ff2442]' : 'hover:text-gray-600'}`}
                    >
                        <Save size={12}/> {t.saved || 'Saved'}
                    </span>
                </div>

                {activeNiche === 'saved' && feedItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <Save size={48} className="mb-4 opacity-20"/>
                        <p className="text-sm">No saved posts yet.</p>
                        <button onClick={() => setActiveNiche('mix')} className="mt-4 text-[#ff2442] text-xs font-bold hover:underline">
                            Create New Post
                        </button>
                    </div>
                ) : (
                    <div className="p-2 columns-2 gap-2 space-y-2">
                        {feedItems.map((item) => (
                            <div 
                                key={item.id} 
                                onClick={() => {
                                    if (activeNiche === 'saved') {
                                        handleLoadSavedPost(item);
                                    } else if (item.isUserDraft) {
                                        setViewMode('detail');
                                    }
                                }}
                                className={`break-inside-avoid bg-white rounded-lg overflow-hidden shadow-sm flex flex-col cursor-pointer transition-transform active:scale-95 mb-2 group relative
                                    ${item.isUserDraft && activeNiche !== 'saved' ? 'ring-2 ring-[#ff2442]' : ''}`}
                            >
                                {item.isUserDraft && activeNiche !== 'saved' && <div className="absolute top-2 right-2 bg-[#ff2442] text-white text-[9px] px-1.5 py-0.5 rounded font-bold z-10 shadow-sm">YOU</div>}
                                {item.isVideo && <div className="absolute top-2 right-2 bg-black/30 text-white p-1 rounded-full z-10 backdrop-blur-sm"><div className="w-0 h-0 border-t-[3px] border-t-transparent border-l-[6px] border-l-white border-b-[3px] border-b-transparent ml-0.5"></div></div>}
                                
                                {activeNiche === 'saved' && (
                                    <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={(e) => handleDeleteSaved(e, item.id)}
                                            className="p-1.5 bg-white/90 text-red-500 rounded-full shadow hover:bg-white transition-colors"
                                        >
                                            <Trash2 size={12}/>
                                        </button>
                                    </div>
                                )}

                                <div className={`w-full bg-gray-200 relative ${item.aspectRatio || 'aspect-[3/4]'}`}>
                                    {item.image ? (
                                        <img src={item.image} className="w-full h-full object-cover" alt={item.title} crossOrigin="anonymous" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                                            <ImageIcon size={24}/>
                                        </div>
                                    )}
                                </div>
                                <div className="p-2">
                                    <div className="font-bold text-xs text-gray-900 line-clamp-2 mb-2 leading-tight">
                                        {item.title || 'Untitled Post'}
                                    </div>
                                    <div className="flex justify-between items-center mt-auto">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <img src={item.avatar} className="w-4 h-4 rounded-full bg-gray-200 object-cover flex-shrink-0" alt=""/>
                                            <span className="text-[10px] text-gray-500 truncate max-w-[60px]">{item.name}</span>
                                        </div>
                                        <div className="flex items-center gap-0.5 text-gray-500 flex-shrink-0">
                                            <Heart size={10} className={Math.random() > 0.7 ? "fill-red-500 text-red-500" : ""}/>
                                            <span className="text-[10px]">{item.likes}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden relative">
            {!compact && (
                <div className="p-6 md:p-8 border-b border-border bg-surface/80 backdrop-blur-md z-10 flex-shrink-0">
                    <div className="max-w-7xl mx-auto flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[#ff2442] flex items-center justify-center shadow-lg shadow-red-500/20">
                            <LayoutTemplate size={24} className="text-white"/>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-textMain tracking-tight">{t.title}</h1>
                            <p className="text-textSecondary text-sm">{t.subtitle}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className={`flex-1 overflow-hidden ${compact ? 'pt-4' : ''}`}>
                <div className="max-w-7xl mx-auto h-full flex flex-col lg:flex-row">
                    
                    {/* LEFT: EDITOR */}
                    <div className="lg:w-1/2 p-6 md:p-8 overflow-y-auto scrollbar-hide border-r border-border">
                        
                        {/* Import Buttons */}
                        {initialData?.content && (
                            <div className="flex gap-2 mb-6">
                                <button 
                                    onClick={handleImportFromChat}
                                    className="flex-1 py-3 border-2 border-dashed border-primary/30 bg-primary/5 text-primary rounded-xl text-xs font-bold hover:bg-primary/10 transition-all flex items-center justify-center gap-2 group"
                                    title="Fast regex extraction"
                                >
                                    <ArrowDownCircle size={16} /> 
                                    {t.importFromChat || 'Fast Import'}
                                </button>
                                <button 
                                    onClick={handleAiParse}
                                    disabled={isAiParsing}
                                    className="flex-1 py-3 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 text-violet-600 rounded-xl text-xs font-bold hover:brightness-95 transition-all flex items-center justify-center gap-2"
                                    title="Use AI to analyze and extract structure"
                                >
                                    {isAiParsing ? <Loader2 size={16} className="animate-spin"/> : <Wand2 size={16} />}
                                    {language === 'zh' ? 'AI 智能识别' : 'AI Smart Parse'}
                                </button>
                            </div>
                        )}

                        {/* ANALYZE / PREDICT BUTTON (NEW) */}
                        <div className="mb-6 flex gap-2">
                            <button
                                onClick={handleAnalyzeDraft}
                                disabled={isAnalyzing || (!title && !content)}
                                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                            >
                                {isAnalyzing ? <Loader2 size={16} className="animate-spin"/> : <TrendingUp size={16}/>}
                                {language === 'zh' ? 'AI 爆款预测 / 打分' : 'Predict Viral Score'}
                            </button>
                        </div>

                        {/* ANALYSIS RESULT PANEL (NEW) */}
                        {analysisResult && (
                            <div className="mb-6 bg-surface border border-border rounded-xl p-4 animate-slide-up shadow-lg">
                                <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
                                    <h3 className="font-bold text-textMain text-sm flex items-center gap-2">
                                        <Sparkles size={14} className="text-emerald-500"/>
                                        {language === 'zh' ? 'AI 诊断报告' : 'AI Analysis Report'}
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-bold text-emerald-500">{analysisResult.score}</span>
                                        <span className="text-[10px] text-textSecondary font-bold bg-background px-1.5 py-0.5 rounded border border-border">/ 100</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div className="bg-background rounded-lg p-2 border border-border text-center">
                                        <div className="text-[10px] text-textSecondary uppercase font-bold mb-1">{t.postTitle}</div>
                                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(analysisResult.titleGrade)}`}>
                                            {analysisResult.titleGrade} Level
                                        </span>
                                    </div>
                                    <div className="bg-background rounded-lg p-2 border border-border text-center">
                                        <div className="text-[10px] text-textSecondary uppercase font-bold mb-1">{t.postContent}</div>
                                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(analysisResult.contentGrade)}`}>
                                            {analysisResult.contentGrade} Level
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-[10px] font-bold text-textSecondary uppercase flex items-center gap-1">
                                        <AlertTriangle size={10} /> Optimization Tips
                                    </div>
                                    <ul className="text-xs text-textMain space-y-1 pl-4 list-disc marker:text-emerald-500">
                                        {analysisResult.suggestions.map((s, i) => (
                                            <li key={i}>{s}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* AI MAGIC BAR */}
                        <div className="bg-gradient-to-r from-pink-500/10 to-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
                            <label className="text-xs font-bold text-[#ff2442] uppercase flex items-center gap-2 mb-2">
                                <Sparkles size={14}/> {t.aiGen}
                            </label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={aiPrompt}
                                    onChange={e => setAiPrompt(e.target.value)}
                                    placeholder={t.aiGenPlaceholder}
                                    className="flex-1 bg-surface border border-red-200/30 rounded-lg px-3 py-2 text-sm focus:border-[#ff2442] outline-none"
                                    onKeyDown={e => e.key === 'Enter' && handleGenerateCopy()}
                                />
                                <button 
                                    onClick={handleGenerateCopy}
                                    disabled={isGeneratingCopy || !aiPrompt.trim()}
                                    className="bg-[#ff2442] hover:bg-[#ff2442]/90 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isGeneratingCopy ? <RefreshCw size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                                    {isGeneratingCopy ? t.generating : 'Generate'}
                                </button>
                                
                                <button 
                                    onClick={() => handleGenerateImage()}
                                    disabled={isGeneratingImage}
                                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                                    title="Generate matching image"
                                >
                                    {isGeneratingImage ? <RefreshCw size={14} className="animate-spin"/> : <Palette size={14}/>}
                                    {isGeneratingImage ? t.generatingImage || 'Drawing...' : t.genImage || 'Image'}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* Images */}
                            <div className="bg-surface border border-border rounded-xl p-4">
                                <label className="text-xs font-bold text-textSecondary uppercase block mb-3">{t.uploadImages}</label>
                                <div className="flex flex-wrap gap-3">
                                    {images.map((img, idx) => (
                                        <div key={idx} className="relative w-24 h-32 rounded-lg overflow-hidden group shadow-sm border border-border">
                                            <img src={img} className="w-full h-full object-cover" alt="uploaded"/>
                                            <button 
                                                onClick={() => removeImage(idx)}
                                                className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={12}/>
                                            </button>
                                        </div>
                                    ))}
                                    <label className="w-24 h-32 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-background transition-all">
                                        <Upload size={20} className="text-textSecondary mb-2"/>
                                        <span className="text-[10px] text-textSecondary font-bold">{t.addImage}</span>
                                        <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload}/>
                                    </label>
                                </div>
                            </div>

                            {/* Text Fields */}
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm font-bold text-textMain block mb-2">{t.postTitle}</label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            value={title} 
                                            onChange={(e) => setTitle(e.target.value)} 
                                            placeholder="Add an interesting title..."
                                            className={`w-full bg-surface border rounded-xl px-4 py-3 text-textMain focus:border-[#ff2442] outline-none text-lg font-bold
                                                ${analysisResult && analysisResult.titleGrade !== 'S' && analysisResult.titleGrade !== 'A' ? 'border-yellow-500/50' : 'border-border'}`}
                                        />
                                        {/* Inline Grade Badge */}
                                        {analysisResult && (
                                            <div className={`absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-xs font-bold border ${getGradeColor(analysisResult.titleGrade)}`}>
                                                {analysisResult.titleGrade}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-bold text-textMain block mb-2">{t.postContent}</label>
                                    
                                    {/* Emoji Toolbar */}
                                    <div className="flex gap-2 mb-2 overflow-x-auto pb-1 scrollbar-hide">
                                        {COMMON_EMOJIS.map(emoji => (
                                            <button key={emoji} onClick={() => insertEmoji(emoji)} className="hover:scale-125 transition-transform text-lg">
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="relative">
                                        <textarea 
                                            value={content} 
                                            onChange={(e) => setContent(e.target.value)} 
                                            placeholder="Share your experience... Use #tags"
                                            className={`w-full h-48 bg-surface border rounded-xl px-4 py-3 text-textMain focus:border-[#ff2442] outline-none resize-none leading-relaxed
                                                ${analysisResult && analysisResult.contentGrade !== 'S' && analysisResult.contentGrade !== 'A' ? 'border-yellow-500/50' : 'border-border'}`}
                                        />
                                        {/* Inline Grade Badge */}
                                        {analysisResult && (
                                            <div className={`absolute right-3 top-3 px-2 py-0.5 rounded text-xs font-bold border ${getGradeColor(analysisResult.contentGrade)}`}>
                                                {analysisResult.contentGrade}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Author & Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-textSecondary uppercase">{t.authorName}</label>
                                        <button onClick={handleRandomizePersona} className="text-[10px] flex items-center gap-1 text-primary hover:underline">
                                            <Dice5 size={12}/> {t.randomize}
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2 bg-surface border border-border rounded-lg p-2">
                                        <img src={authorAvatar} className="w-8 h-8 rounded-full bg-black/20" alt=""/>
                                        <input 
                                            type="text" 
                                            value={authorName} 
                                            onChange={(e) => setAuthorName(e.target.value)} 
                                            className="bg-transparent border-none text-sm text-textMain focus:ring-0 w-full"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-textSecondary uppercase">{t.stats}</label>
                                        <button 
                                            onClick={() => handleGenerateComments(content)}
                                            disabled={isGeneratingComments}
                                            className="text-[10px] flex items-center gap-1 text-accent hover:underline disabled:opacity-50"
                                        >
                                            {isGeneratingComments ? <RefreshCw size={12} className="animate-spin"/> : <MessageSquarePlus size={12}/>} 
                                            {t.genComments}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div>
                                            <span className="text-[10px] text-textSecondary block mb-1">Likes</span>
                                            <input type="text" value={likes} onChange={e => setLikes(e.target.value)} className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-textMain"/>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-textSecondary block mb-1">Collects</span>
                                            <input type="text" value={collects} onChange={e => setCollects(e.target.value)} className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-textMain"/>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-textSecondary block mb-1">Comments</span>
                                            <input type="text" value={comments} onChange={e => setComments(e.target.value)} className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-textMain"/>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: PREVIEW */}
                    <div className="lg:w-1/2 bg-background border-l border-border p-4 flex flex-col items-center justify-center relative overflow-hidden">
                        {/* Background pattern */}
                        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(var(--color-border) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                        {/* View Mode Toggle */}
                        <div className="relative z-20 flex flex-col gap-2 items-center mb-4 w-full max-w-[280px]">
                            {/* Mode Switch */}
                            <div className="bg-surface/80 backdrop-blur-md rounded-full p-1 flex gap-1 border border-border shadow-lg w-full">
                                <button 
                                    onClick={() => setViewMode('detail')}
                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewMode === 'detail' ? 'bg-[#ff2442] text-white shadow-md' : 'text-textSecondary hover:bg-background'}`}
                                >
                                    <Smartphone size={14} /> {t.modeDetail || 'Detail'}
                                </button>
                                <button 
                                    onClick={() => setViewMode('list')}
                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-[#ff2442] text-white shadow-md' : 'text-textSecondary hover:bg-background'}`}
                                >
                                    <LayoutGrid size={14} /> {t.modeFeed || 'Feed'}
                                </button>
                            </div>

                            {/* Feed Environment Selector (Only in List Mode) */}
                            {viewMode === 'list' && (
                                <div className="flex items-center gap-2 bg-surface/80 backdrop-blur-md border border-border rounded-lg px-2 py-1 shadow-sm animate-fade-in">
                                    <span className="text-[10px] font-bold text-textSecondary uppercase flex items-center gap-1">
                                        <Filter size={10}/> {t.feedEnv || 'Feed'}:
                                    </span>
                                    <div className="flex gap-1">
                                        {(['mix', 'tech', 'beauty', 'food'] as NicheType[]).map(niche => (
                                            <button 
                                                key={niche}
                                                onClick={() => setActiveNiche(niche)}
                                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors border
                                                    ${activeNiche === niche 
                                                        ? 'bg-primary/10 border-primary text-primary' 
                                                        : 'bg-transparent border-transparent text-textSecondary hover:bg-background'}`}
                                            >
                                                {t.niche ? t.niche[niche] : niche}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* NEW: Download Action Bar */}
                        <div className="absolute right-4 top-4 z-50 flex gap-2">
                            {activeProject && (
                                <button
                                    onClick={handleSaveAsExample}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:brightness-110 text-white rounded-full shadow-lg transition-all font-bold text-xs"
                                    title="Save success story to context"
                                >
                                    {showExampleSaved ? <Check size={16}/> : <BookPlus size={16}/>}
                                    {language === 'zh' ? '沉淀为范例' : 'Save as Example'}
                                </button>
                            )}
                            <button
                                onClick={handleDownload}
                                disabled={isDownloading}
                                className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 text-gray-800 rounded-full shadow-lg border border-gray-200 transition-all font-bold text-xs"
                                title="Download as PNG"
                            >
                                {isDownloading ? <Loader2 size={16} className="animate-spin text-[#ff2442]"/> : <Camera size={16} className="text-[#ff2442]"/>}
                                {language === 'zh' ? '下载截图' : 'Download'}
                            </button>
                        </div>

                        {/* SCALING WRAPPER - Ensures phone fits in view */}
                        <div className="origin-center scale-[0.80] md:scale-[0.85] xl:scale-95 2xl:scale-100 transition-transform duration-300 ease-out flex-shrink-0 relative">
                            
                            {/* PHONE FRAME (The Bezel) - iPhone 15 Pro Style */}
                            <div ref={phoneRef} className="w-[390px] h-[844px] bg-[#2d2d2d] rounded-[60px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] p-[12px] relative border-[4px] border-[#3a3a3a] box-content ring-1 ring-white/10">
                                
                                {/* Hardware Buttons (Decoration) */}
                                <div className="absolute top-28 -left-[8px] h-8 w-[8px] bg-[#3a3a3a] rounded-l-md shadow-sm"></div> {/* Action Btn */}
                                <div className="absolute top-44 -left-[8px] h-16 w-[8px] bg-[#3a3a3a] rounded-l-md shadow-sm"></div> {/* Vol Up */}
                                <div className="absolute top-64 -left-[8px] h-16 w-[8px] bg-[#3a3a3a] rounded-l-md shadow-sm"></div> {/* Vol Down */}
                                <div className="absolute top-48 -right-[8px] h-24 w-[8px] bg-[#3a3a3a] rounded-r-md shadow-sm"></div> {/* Power */}

                                {/* SCREEN AREA */}
                                <div className="w-full h-full bg-white rounded-[48px] overflow-hidden relative flex flex-col">
                                    
                                    {/* Dynamic Island / Notch */}
                                    <div className="absolute top-[11px] left-1/2 -translate-x-1/2 w-[120px] h-[35px] bg-black rounded-[20px] z-50 flex items-center justify-center pointer-events-none">
                                        {/* Sensors hint */}
                                        <div className="flex gap-3 opacity-30">
                                            <div className="w-2 h-2 rounded-full bg-[#333]"></div>
                                            <div className="w-2 h-2 rounded-full bg-[#111]"></div>
                                        </div>
                                    </div>

                                    {/* Status Bar */}
                                    <div className="h-14 px-8 flex items-end justify-between pb-3 bg-white text-black z-40 select-none">
                                        <span className="font-bold text-sm ml-2">9:41</span>
                                        <div className="flex gap-1.5 mr-2">
                                            <div className="w-4 h-2.5 bg-black rounded-[1px]"></div>
                                            <div className="w-3 h-2.5 bg-black rounded-[1px]"></div>
                                            <div className="w-5 h-2.5 border border-black rounded-[2px] relative"><div className="absolute inset-0.5 bg-black"></div></div>
                                        </div>
                                    </div>

                                    {/* CONDITIONAL RENDER: Detail View vs List View */}
                                    {viewMode === 'detail' ? (
                                        <>
                                            {/* App Header */}
                                            <div className="h-12 px-4 flex items-center justify-between bg-white text-black z-20 sticky top-0 flex-shrink-0">
                                                <button onClick={() => setViewMode('list')} className="p-1 -ml-1">
                                                    <ChevronLeft size={24} className="text-gray-800"/>
                                                </button>
                                                <div className="flex items-center gap-2">
                                                    <img src={authorAvatar} className="w-8 h-8 rounded-full border border-gray-100 object-cover" alt="avatar" crossOrigin="anonymous"/>
                                                    <span className="text-sm font-bold truncate max-w-[100px]">{authorName}</span>
                                                    <button className="px-3 py-1 rounded-full border border-[#ff2442] text-[#ff2442] text-xs font-bold hover:bg-[#ff2442]/5 transition-colors">Follow</button>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={handleSavePost}
                                                        className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 hover:text-[#ff2442] transition-colors"
                                                        title="Save to Drafts"
                                                    >
                                                        <Save size={20}/>
                                                    </button>
                                                    <Share2 size={22} className="text-gray-800"/>
                                                </div>
                                            </div>

                                            {/* SCROLLABLE CONTENT */}
                                            <div className="flex-1 overflow-y-auto scrollbar-hide bg-white text-black pb-24 relative">
                                                
                                                {/* Image Swiper */}
                                                <div className="relative w-full aspect-[3/4] bg-gray-100">
                                                    {images.length > 0 ? (
                                                        <>
                                                            <img src={images[currentImageIndex]} className="w-full h-full object-cover" alt="post content" crossOrigin="anonymous"/>
                                                            {images.length > 1 && (
                                                                <div className="absolute top-1/2 left-0 w-full flex justify-between px-2">
                                                                    <button onClick={() => setCurrentImageIndex(prev => Math.max(0, prev - 1))} className="p-1 bg-black/20 text-white rounded-full backdrop-blur-sm disabled:opacity-0 transition-opacity" disabled={currentImageIndex === 0}><ChevronLeft size={20}/></button>
                                                                    <button onClick={() => setCurrentImageIndex(prev => Math.min(images.length - 1, prev + 1))} className="p-1 bg-black/20 text-white rounded-full backdrop-blur-sm disabled:opacity-0 transition-opacity" disabled={currentImageIndex === images.length - 1}><ChevronLeft size={20} className="rotate-180"/></button>
                                                                </div>
                                                            )}
                                                            {/* Dots */}
                                                            {images.length > 1 && (
                                                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                                                                    {images.map((_, i) => (
                                                                        <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentImageIndex ? 'bg-[#ff2442]' : 'bg-white/50'}`}></div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                                                            <ImageIcon size={48} className="mb-2 opacity-50"/>
                                                            <span className="text-xs">No Image</span>
                                                        </div>
                                                    )}
                                                    {/* Tags on image simulation */}
                                                    {images.length > 0 && (
                                                        <div className="absolute bottom-4 right-4 bg-black/50 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm">
                                                            AI Generated
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Body */}
                                                <div className="p-4">
                                                    <h1 className="text-lg font-bold leading-snug mb-3 text-gray-900">{title || 'Your Title Here'}</h1>
                                                    <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap mb-4">
                                                        {content ? renderContent(content) : <span className="text-gray-400">Your content description goes here... #AI #Tech</span>}
                                                    </div>
                                                    <div className="text-xs text-gray-400 flex items-center gap-1 mb-6">
                                                        <span>10-24</span>
                                                        <span>Shanghai</span>
                                                    </div>
                                                    
                                                    <div className="h-px bg-gray-100 w-full mb-4"></div>

                                                    {/* Comments Preview */}
                                                    <div className="space-y-4">
                                                        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                                                            <span>All {comments} comments</span>
                                                            <div className="flex items-center gap-1"><span className="w-4 h-4 rounded-full border border-gray-300"></span> <ChevronLeft size={10} className="-rotate-90"/></div>
                                                        </div>
                                                        
                                                        {/* Dynamic Comments List */}
                                                        {commentsList.map((comment, idx) => (
                                                            <div key={idx} className="flex gap-3 animate-fade-in">
                                                                <div className={`w-8 h-8 rounded-full ${comment.avatarColor || 'bg-gray-200'} flex-shrink-0`}></div>
                                                                <div className="flex-1">
                                                                    <div className="text-xs text-gray-500 mb-0.5">{comment.user}</div>
                                                                    <div className="text-xs text-gray-800">{comment.content}</div>
                                                                </div>
                                                                <div className="flex flex-col items-center">
                                                                    <Heart size={12} className="text-gray-400"/>
                                                                    <span className="text-[10px] text-gray-400">{comment.likes}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Floating Bottom Bar */}
                                            <div className="absolute bottom-0 left-0 w-full bg-white border-t border-gray-100 px-4 py-2 pb-8 flex items-center justify-between z-30">
                                                <div className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-xs text-gray-400 flex items-center gap-2 mr-4">
                                                    <div className="text-gray-400">Say something...</div>
                                                </div>
                                                <div className="flex items-center gap-5 text-gray-700">
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <Heart size={22} className={Number(likes) > 0 ? "" : ""}/>
                                                        <span className="text-[10px] font-medium">{likes}</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <Star size={22}/>
                                                        <span className="text-[10px] font-medium">{collects}</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <MessageCircle size={22}/>
                                                        <span className="text-[10px] font-medium">{comments}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        // LIST VIEW (FEED) RENDERER
                                        <>
                                            {renderFeed()}
                                            {/* Bottom Navigation Bar */}
                                            <div className="absolute bottom-0 left-0 w-full bg-white border-t border-gray-100 px-6 py-2 pb-8 flex items-center justify-between z-30 text-gray-400">
                                                <div className="flex flex-col items-center text-black font-bold">
                                                    <div className="text-sm">Home</div>
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    <div className="text-sm">Shop</div>
                                                </div>
                                                <div className="bg-[#ff2442] text-white p-2 rounded-lg -mt-4 shadow-md">
                                                    <Plus size={20}/>
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    <div className="text-sm">Inbox</div>
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    <div className="text-sm">Me</div>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* Home Indicator */}
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-black rounded-full z-50"></div>
                                    
                                    {/* Toast Notification */}
                                    {showSaveSuccess && (
                                        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-4 py-2 rounded-full shadow-lg z-50 flex items-center gap-2 animate-fade-in">
                                            <Check size={12}/> {t.savedSuccess || 'Saved!'}
                                        </div>
                                    )}
                                    {showExampleSaved && (
                                        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-emerald-500/90 text-white text-xs px-4 py-2 rounded-full shadow-lg z-50 flex items-center gap-2 animate-fade-in whitespace-nowrap">
                                            <Check size={12}/> {language === 'zh' ? '已沉淀到知识库' : 'Saved to Context Examples'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default XiaohongshuSimulator;
