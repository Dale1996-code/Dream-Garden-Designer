import { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Leaf, Loader2, Sparkles, Map, Download, Bookmark, BookmarkCheck, Library, PlusCircle, Trash2, Search, ThumbsUp, ThumbsDown, RefreshCw, Droplets, Sun, Flower2, Bell, BellPlus, CheckCircle2, Calendar, X, Bug, CloudSun, Heart, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import localforage from 'localforage';
// @ts-ignore
import html2pdf from 'html2pdf.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const STYLES = ['Modern', 'English Cottage', 'Japanese Zen', 'Mediterranean', 'Tropical', 'Desert / Xeriscape'];
const CLIMATES = ['Temperate', 'Arid', 'Tropical', 'Continental'];
const SIZES = ['Small Balcony', 'Small Backyard', 'Large Backyard', 'Estate'];
const COLORS = ['Vibrant & Colorful', 'Pastel & Soft', 'Cool Blues & Purples', 'Warm Reds & Oranges', 'Monochromatic Green'];

function getWeatherDesc(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Cloudy';
  if (code <= 48) return 'Fog';
  if (code <= 55) return 'Drizzle';
  if (code <= 65) return 'Rain';
  if (code <= 75) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Variable';
}

interface SavedDesign {
  id: string;
  date: number;
  image: string;
  plan: string;
  preferences: {
    style: string;
    climate: string;
    size: string;
    colors: string;
  };
}

interface Plant {
  id: string;
  commonName: string;
  scientificName: string;
  wateringNeeds: string;
  sunlightRequirements: string;
  bloomTime: string;
  commonIssues?: string;
  careTips?: string;
  careGuide?: {
    pests: string;
    diseases: string;
    preventativeCare: string;
    treatmentTips: string;
  };
  feedback?: 'like' | 'dislike' | null;
}

interface GardenPlanData {
  conceptOverview: string;
  keyFeatures: string;
  layoutSuggestions: string;
  plantPalette: Plant[];
}

interface Reminder {
  id: string;
  plantName: string;
  taskType: string;
  frequencyDays: number;
  lastCompleted: number;
  nextDue: number;
  lastNotified?: number;
  history?: number[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'create' | 'saved' | 'reminders' | 'wishlist'>('create');
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [plantSearchQuery, setPlantSearchQuery] = useState('');

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [wishlist, setWishlist] = useState<Plant[]>([]);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [selectedPlantForReminder, setSelectedPlantForReminder] = useState<string>('');
  const [reminderTask, setReminderTask] = useState('Watering');
  const [reminderFrequency, setReminderFrequency] = useState(7);
  const [selectedCareGuide, setSelectedCareGuide] = useState<Plant | null>(null);

  const [style, setStyle] = useState(STYLES[0]);
  const [climate, setClimate] = useState(CLIMATES[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [colors, setColors] = useState(COLORS[0]);
  const [details, setDetails] = useState('');
  const [location, setLocation] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegeneratingPlants, setIsRegeneratingPlants] = useState(false);
  const [gardenPlan, setGardenPlan] = useState('');
  const [gardenImage, setGardenImage] = useState('');
  const [error, setError] = useState('');
  const [weatherData, setWeatherData] = useState<{ temp: number, desc: string, humidity: number, name: string } | null>(null);

  // Load saved designs and reminders on mount
  useEffect(() => {
    const loadData = async () => {
      const designs = await localforage.getItem<SavedDesign[]>('savedGardens');
      if (designs) setSavedDesigns(designs);
      
      const savedReminders = await localforage.getItem<Reminder[]>('plantReminders');
      if (savedReminders) setReminders(savedReminders);
      
      const savedWishlist = await localforage.getItem<Plant[]>('plantWishlist');
      if (savedWishlist) setWishlist(savedWishlist);
      
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let updated = false;
      const newReminders = reminders.map(r => {
        if (r.nextDue <= now && (!r.lastNotified || now - r.lastNotified > 86400000)) {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(`Plant Care Due: ${r.plantName}`, {
              body: `It's time for ${r.taskType.toLowerCase()}!`,
            });
          }
          updated = true;
          return { ...r, lastNotified: now };
        }
        return r;
      });
      
      if (updated) {
        setReminders(newReminders);
        localforage.setItem('plantReminders', newReminders);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [reminders]);

  const generateGarden = async () => {
    setIsGenerating(true);
    setError('');
    setGardenPlan('');
    setGardenImage('');
    setWeatherData(null);

    let weatherContext = '';
    let fetchedWeather = null;

    if (location.trim()) {
      try {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`);
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results.length > 0) {
          const { latitude, longitude, name, country } = geoData.results[0];
          const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code`);
          const weatherJson = await weatherRes.json();
          const temp = weatherJson.current.temperature_2m;
          const humidity = weatherJson.current.relative_humidity_2m;
          const code = weatherJson.current.weather_code;
          const desc = getWeatherDesc(code);
          fetchedWeather = { temp, desc, humidity, name: `${name}, ${country}` };
          setWeatherData(fetchedWeather);
          weatherContext = `Current Weather in ${fetchedWeather.name}: ${temp}°C, ${desc}, ${humidity}% humidity. Please suggest plants that thrive in these specific current conditions as well as the general climate.`;
        }
      } catch (e) {
        console.error("Weather fetch failed", e);
      }
    }

    try {
      const promptContext = `A ${size} garden in a ${climate} climate. Style: ${style}. Color palette: ${colors}. ${details ? `Additional details: ${details}` : ''}`;
      
      // 1. Generate Image
      const imagePrompt = `A beautiful, highly detailed, realistic photograph of a ${promptContext}. Lush, well-designed, professional landscaping.`;
      
      const imagePromise = ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: imagePrompt }]
        }
      });

      // 2. Generate Text Plan
      const textPrompt = `You are an expert landscape architect. Design a garden based on these preferences:
      - Size: ${size}
      - Climate: ${climate}
      - Style: ${style}
      - Color Palette: ${colors}
      - User Requests: ${details || 'None'}
      ${weatherContext ? `- Local Weather Context: ${weatherContext}` : ''}

      Provide a structured, inspiring garden plan.
      You MUST return ONLY a valid JSON object with the following structure:
      {
        "conceptOverview": "A brief description of the garden's vibe (markdown supported)",
        "keyFeatures": "Hardscaping, water features, paths, etc (markdown supported)",
        "layoutSuggestions": "How to arrange the space (markdown supported)",
        "plantPalette": [
          {
            "commonName": "...",
            "scientificName": "...",
            "wateringNeeds": "...",
            "sunlightRequirements": "...",
            "bloomTime": "...",
            "careGuide": {
              "pests": "Common pests that affect this plant",
              "diseases": "Common diseases",
              "preventativeCare": "Tips to prevent issues",
              "treatmentTips": "How to treat pests and diseases"
            }
          }
        ]
      }`;

      const textPromise = ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: textPrompt
      });

      const [imageResponse, textResponse] = await Promise.all([imagePromise, textPromise]);

      // Extract Image
      let imageUrl = '';
      const parts = imageResponse.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
      if (imageUrl) {
        setGardenImage(imageUrl);
      } else {
        console.error("No image data found in response", imageResponse);
      }

      // Extract Text
      if (textResponse.text) {
        try {
          const cleanedText = textResponse.text.replace(/```json\n?|\n?```/g, '').trim();
          const data = JSON.parse(cleanedText);
          if (data.plantPalette) {
            data.plantPalette = data.plantPalette.map((p: any) => ({ ...p, id: crypto.randomUUID() }));
          }
          setGardenPlan(JSON.stringify(data));
        } catch (e) {
          setGardenPlan(textResponse.text);
        }
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to generate garden design. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePlantFeedback = (plantId: string, feedback: 'like' | 'dislike') => {
    try {
      const data = JSON.parse(gardenPlan) as GardenPlanData;
      const updatedPalette = data.plantPalette.map(p => {
        if (p.id === plantId) {
          return { ...p, feedback: p.feedback === feedback ? null : feedback };
        }
        return p;
      });
      setGardenPlan(JSON.stringify({ ...data, plantPalette: updatedPalette }));
    } catch (e) {
      console.error("Cannot update feedback on non-JSON plan");
    }
  };

  const openReminderModal = (plantName: string) => {
    setSelectedPlantForReminder(plantName);
    setReminderTask('Watering');
    setReminderFrequency(7);
    setIsReminderModalOpen(true);
  };

  const saveReminder = async () => {
    const now = Date.now();
    const newReminder: Reminder = {
      id: crypto.randomUUID(),
      plantName: selectedPlantForReminder,
      taskType: reminderTask,
      frequencyDays: reminderFrequency,
      lastCompleted: now,
      nextDue: now + (reminderFrequency * 24 * 60 * 60 * 1000)
    };
    
    const updatedReminders = [...reminders, newReminder];
    setReminders(updatedReminders);
    await localforage.setItem('plantReminders', updatedReminders);
    setIsReminderModalOpen(false);
  };

  const markReminderDone = async (id: string) => {
    const now = Date.now();
    const updatedReminders = reminders.map(r => {
      if (r.id === id) {
        return {
          ...r,
          lastCompleted: now,
          nextDue: now + (r.frequencyDays * 24 * 60 * 60 * 1000),
          lastNotified: undefined,
          history: [now, ...(r.history || [])].slice(0, 10)
        };
      }
      return r;
    });
    setReminders(updatedReminders);
    await localforage.setItem('plantReminders', updatedReminders);
  };

  const deleteReminder = async (id: string) => {
    const updatedReminders = reminders.filter(r => r.id !== id);
    setReminders(updatedReminders);
    await localforage.setItem('plantReminders', updatedReminders);
  };

  const toggleWishlist = async (plant: Plant) => {
    let updatedWishlist;
    if (wishlist.some(p => p.commonName === plant.commonName)) {
      updatedWishlist = wishlist.filter(p => p.commonName !== plant.commonName);
    } else {
      updatedWishlist = [...wishlist, { ...plant, id: crypto.randomUUID() }];
    }
    setWishlist(updatedWishlist);
    await localforage.setItem('plantWishlist', updatedWishlist);
  };

  const regeneratePlants = async () => {
    try {
      const data = JSON.parse(gardenPlan) as GardenPlanData;
      setIsRegeneratingPlants(true);
      setError('');

      const likedPlants = data.plantPalette.filter(p => p.feedback === 'like').map(p => p.commonName);
      const dislikedPlants = data.plantPalette.filter(p => p.feedback === 'dislike').map(p => p.commonName);

      const prompt = `You are an expert landscape architect. I have a garden plan with the following preferences:
      - Size: ${size}
      - Climate: ${climate}
      - Style: ${style}
      - Color Palette: ${colors}
      
      The user liked these plants: ${likedPlants.length > 0 ? likedPlants.join(', ') : 'None specified'}
      The user disliked these plants: ${dislikedPlants.length > 0 ? dislikedPlants.join(', ') : 'None specified'}
      
      Please provide a NEW plant palette for this garden. 
      - KEEP the liked plants.
      - DO NOT include the disliked plants.
      - Suggest new plants to replace the disliked ones or to complement the liked ones, fitting the climate and style.
      
      You MUST return ONLY a valid JSON object with the following structure:
      {
        "plantPalette": [
          {
            "commonName": "...",
            "scientificName": "...",
            "wateringNeeds": "...",
            "sunlightRequirements": "...",
            "bloomTime": "...",
            "careGuide": {
              "pests": "Common pests that affect this plant",
              "diseases": "Common diseases",
              "preventativeCare": "Tips to prevent issues",
              "treatmentTips": "How to treat pests and diseases"
            }
          }
        ]
      }`;

      const textPromise = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });

      if (textPromise.text) {
        const cleanedText = textPromise.text.replace(/```json\n?|\n?```/g, '').trim();
        const newData = JSON.parse(cleanedText);
        
        if (newData.plantPalette) {
          const newPalette = newData.plantPalette.map((p: any) => {
            const existingLiked = data.plantPalette.find(ep => ep.commonName === p.commonName && ep.feedback === 'like');
            return {
              ...p,
              id: crypto.randomUUID(),
              feedback: existingLiked ? 'like' : null
            };
          });
          
          setGardenPlan(JSON.stringify({ ...data, plantPalette: newPalette }));
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to regenerate plants. Please try again.');
    } finally {
      setIsRegeneratingPlants(false);
    }
  };

  const renderPlan = (planStr: string) => {
    try {
      const data = JSON.parse(planStr) as GardenPlanData;
      return (
        <div className="space-y-8">
          <section>
            <h4 className="text-xl font-medium text-emerald-800 mb-3">Concept Overview</h4>
            <div className="prose prose-stone prose-emerald max-w-none">
              <ReactMarkdown>{data.conceptOverview}</ReactMarkdown>
            </div>
          </section>
          
          <section>
            <h4 className="text-xl font-medium text-emerald-800 mb-3">Key Features</h4>
            <div className="prose prose-stone prose-emerald max-w-none">
              <ReactMarkdown>{data.keyFeatures}</ReactMarkdown>
            </div>
          </section>

          <section>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
              <h4 className="text-xl font-medium text-emerald-800">Plant Palette</h4>
              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative w-full sm:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-stone-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search plants..."
                    value={plantSearchQuery}
                    onChange={(e) => setPlantSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-1.5 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                  />
                </div>
                <button 
                  onClick={regeneratePlants}
                  disabled={isRegeneratingPlants}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors disabled:opacity-50"
                >
                  {isRegeneratingPlants ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Regenerate
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.plantPalette
                .filter(plant => plant.commonName.toLowerCase().includes(plantSearchQuery.toLowerCase()))
                .map((plant, index) => {
                const isWishlisted = wishlist.some(p => p.commonName === plant.commonName);
                return (
                <div key={plant.id || index} className="border border-stone-200 rounded-xl p-4 bg-stone-50 relative group">
                  <div className={`absolute top-3 right-3 flex gap-1 transition-opacity ${plant.feedback || isWishlisted ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <button 
                      onClick={() => toggleWishlist(plant)}
                      className={`p-1.5 rounded-md transition-colors ${isWishlisted ? 'bg-pink-100 text-pink-600' : 'bg-white text-stone-400 hover:text-pink-600 hover:bg-pink-50 shadow-sm'}`}
                      title={isWishlisted ? "Remove from Wishlist" : "Add to Wishlist"}
                    >
                      <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} />
                    </button>
                    <button 
                      onClick={() => openReminderModal(plant.commonName)}
                      className="p-1.5 rounded-md transition-colors bg-white text-stone-400 hover:text-blue-600 hover:bg-blue-50 shadow-sm"
                      title="Add Care Reminder"
                    >
                      <BellPlus className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handlePlantFeedback(plant.id, 'like')}
                      className={`p-1.5 rounded-md transition-colors ${plant.feedback === 'like' ? 'bg-green-100 text-green-700' : 'bg-white text-stone-400 hover:text-green-600 hover:bg-green-50 shadow-sm'}`}
                      title="Like this plant"
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handlePlantFeedback(plant.id, 'dislike')}
                      className={`p-1.5 rounded-md transition-colors ${plant.feedback === 'dislike' ? 'bg-red-100 text-red-700' : 'bg-white text-stone-400 hover:text-red-600 hover:bg-red-50 shadow-sm'}`}
                      title="Dislike this plant"
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <h5 className="font-semibold text-stone-800 pr-32">{plant.commonName}</h5>
                  <p className="text-sm text-stone-500 italic mb-3">{plant.scientificName}</p>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <Droplets className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <span className="text-stone-600">{plant.wateringNeeds}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Sun className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span className="text-stone-600">{plant.sunlightRequirements}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Flower2 className="w-4 h-4 text-pink-400 shrink-0 mt-0.5" />
                      <span className="text-stone-600">{plant.bloomTime}</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-stone-200/60">
                    <button
                      onClick={() => setSelectedCareGuide(plant)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium"
                    >
                      <BookOpen className="w-4 h-4" />
                      View Care Guide
                    </button>
                  </div>
                </div>
              )})}
            </div>
          </section>

          <section>
            <h4 className="text-xl font-medium text-emerald-800 mb-3">Layout Suggestions</h4>
            <div className="prose prose-stone prose-emerald max-w-none">
              <ReactMarkdown>{data.layoutSuggestions}</ReactMarkdown>
            </div>
          </section>
        </div>
      );
    } catch (e) {
      // Fallback for old markdown format
      return (
        <div className="prose prose-stone prose-emerald max-w-none">
          <ReactMarkdown>{planStr}</ReactMarkdown>
        </div>
      );
    }
  };

  const saveCurrentDesign = async () => {
    if (!gardenImage || !gardenPlan) return;
    setIsSaving(true);
    
    const newDesign: SavedDesign = {
      id: crypto.randomUUID(),
      date: Date.now(),
      image: gardenImage,
      plan: gardenPlan,
      preferences: { style, climate, size, colors }
    };

    const updatedDesigns = [newDesign, ...savedDesigns];
    setSavedDesigns(updatedDesigns);
    await localforage.setItem('savedGardens', updatedDesigns);
    setIsSaving(false);
  };

  const deleteDesign = async (id: string) => {
    const updatedDesigns = savedDesigns.filter(d => d.id !== id);
    setSavedDesigns(updatedDesigns);
    await localforage.setItem('savedGardens', updatedDesigns);
  };

  const exportToPDF = () => {
    setIsExporting(true);
    const element = document.getElementById('garden-result-content');
    if (!element) {
      setIsExporting(false);
      return;
    }

    const opt = {
      margin: 15,
      filename: `garden-design-${style.toLowerCase().replace(/\s+/g, '-')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
      setIsExporting(false);
    }).catch((err: any) => {
      console.error('PDF Export Error:', err);
      setIsExporting(false);
    });
  };

  const isCurrentSaved = savedDesigns.some(d => d.image === gardenImage && d.plan === gardenPlan);

  const filteredDesigns = savedDesigns.filter(design => {
    const query = searchQuery.toLowerCase();
    return (
      design.plan.toLowerCase().includes(query) ||
      design.preferences.style.toLowerCase().includes(query) ||
      design.preferences.climate.toLowerCase().includes(query) ||
      design.preferences.colors.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 font-sans selection:bg-emerald-200">
      {/* Header */}
      <header className="bg-emerald-900 text-emerald-50 py-4 px-6 md:px-8 shadow-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Leaf className="w-8 h-8 text-emerald-400" />
            <h1 className="text-2xl font-semibold tracking-tight">Dream Garden Designer</h1>
          </div>
          
          <div className="flex bg-emerald-800/50 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('create')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'create' ? 'bg-emerald-700 text-white shadow-sm' : 'text-emerald-100 hover:text-white hover:bg-emerald-800/50'}`}
            >
              <PlusCircle className="w-4 h-4" />
              Create New
            </button>
            <button 
              onClick={() => setActiveTab('saved')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'saved' ? 'bg-emerald-700 text-white shadow-sm' : 'text-emerald-100 hover:text-white hover:bg-emerald-800/50'}`}
            >
              <Library className="w-4 h-4" />
              Saved Designs ({savedDesigns.length})
            </button>
            <button 
              onClick={() => setActiveTab('reminders')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'reminders' ? 'bg-emerald-700 text-white shadow-sm' : 'text-emerald-100 hover:text-white hover:bg-emerald-800/50'}`}
            >
              <Bell className="w-4 h-4" />
              Reminders ({reminders.filter(r => r.nextDue <= Date.now()).length || reminders.length})
            </button>
            <button 
              onClick={() => setActiveTab('wishlist')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'wishlist' ? 'bg-emerald-700 text-white shadow-sm' : 'text-emerald-100 hover:text-white hover:bg-emerald-800/50'}`}
            >
              <Heart className="w-4 h-4" />
              Wishlist ({wishlist.length})
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-8">
        {activeTab === 'create' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Form */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                <h2 className="text-xl font-medium mb-6 flex items-center gap-2 text-emerald-900">
                  <Sparkles className="w-5 h-5" />
                  Your Preferences
                </h2>

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-1">Garden Style</label>
                    <select 
                      value={style} 
                      onChange={(e) => setStyle(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    >
                      {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-1">Climate Zone</label>
                    <select 
                      value={climate} 
                      onChange={(e) => setClimate(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    >
                      {CLIMATES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-1">Space Size</label>
                    <select 
                      value={size} 
                      onChange={(e) => setSize(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    >
                      {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-1">Color Palette</label>
                    <select 
                      value={colors} 
                      onChange={(e) => setColors(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    >
                      {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-1">Location (City, Country) - Optional</label>
                    <input 
                      type="text"
                      value={location} 
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="E.g., Seattle, WA"
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-1">Additional Details (Optional)</label>
                    <textarea 
                      value={details} 
                      onChange={(e) => setDetails(e.target.value)}
                      placeholder="E.g., I want a small pond, a fire pit, and lots of lavender..."
                      rows={3}
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all resize-none"
                    />
                  </div>

                  <button
                    onClick={generateGarden}
                    disabled={isGenerating}
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Designing...
                      </>
                    ) : (
                      <>
                        <Leaf className="w-5 h-5" />
                        Generate Garden
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Results */}
            <div className="lg:col-span-8">
              {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 border border-red-100">
                  {error}
                </div>
              )}

              {!isGenerating && !gardenImage && !gardenPlan && !error && (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-stone-400 border-2 border-dashed border-stone-200 rounded-2xl bg-stone-50/50">
                  <Map className="w-16 h-16 mb-4 text-stone-300" />
                  <p className="text-lg font-medium text-stone-500">Your dream garden awaits</p>
                  <p className="text-sm">Fill out your preferences and click generate.</p>
                </div>
              )}

              <AnimatePresence mode="wait">
                {(gardenImage || gardenPlan) && !isGenerating && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* Action Bar */}
                    <div className="flex flex-wrap gap-3 justify-between items-center">
                      <div className="flex items-center gap-2">
                        {weatherData && (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium border border-blue-100">
                            <CloudSun className="w-4 h-4" />
                            {weatherData.name}: {weatherData.temp}°C, {weatherData.desc} ({weatherData.humidity}%)
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={saveCurrentDesign}
                          disabled={isCurrentSaved || isSaving}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                            isCurrentSaved 
                              ? 'bg-stone-100 text-stone-400 cursor-not-allowed' 
                              : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 shadow-sm'
                          }`}
                        >
                          {isCurrentSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                          {isCurrentSaved ? 'Saved' : 'Save Design'}
                        </button>
                        
                        <button
                          onClick={exportToPDF}
                          disabled={isExporting}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shadow-sm disabled:opacity-70"
                        >
                          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          Export PDF
                        </button>
                      </div>
                    </div>

                    {/* Exportable Content Area */}
                    <div id="garden-result-content" className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-stone-200 space-y-8">
                      {/* Image Result */}
                      {gardenImage && (
                        <div className="rounded-xl overflow-hidden border border-stone-100">
                          <img 
                            src={gardenImage} 
                            alt="Generated Garden Design" 
                            className="w-full h-auto object-cover max-h-[600px]"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}

                      {/* Text Result */}
                      {gardenPlan && (
                        <div>
                          <h3 className="text-2xl font-semibold text-emerald-900 mb-6 border-b border-stone-100 pb-4">
                            Your Garden Plan
                          </h3>
                          {renderPlan(gardenPlan)}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {isGenerating && (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-emerald-600">
                  <Loader2 className="w-12 h-12 animate-spin mb-4" />
                  <p className="text-lg font-medium animate-pulse">Cultivating your design...</p>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'saved' ? (
          /* Saved Designs Tab */
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-stone-200 pb-4 gap-4">
              <h2 className="text-2xl font-semibold text-emerald-900">Your Saved Designs</h2>
              {savedDesigns.length > 0 && (
                <div className="relative w-full md:w-72">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-stone-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search plants, styles, keywords..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                  />
                </div>
              )}
            </div>

            {savedDesigns.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-stone-400">
                <Library className="w-16 h-16 mb-4 text-stone-300" />
                <p className="text-lg font-medium text-stone-500">No saved designs yet</p>
                <p className="text-sm mt-2">Create a new garden and click "Save Design" to see it here.</p>
                <button 
                  onClick={() => setActiveTab('create')}
                  className="mt-6 px-6 py-2 bg-emerald-100 text-emerald-800 rounded-lg font-medium hover:bg-emerald-200 transition-colors"
                >
                  Start Designing
                </button>
              </div>
            ) : filteredDesigns.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-stone-400">
                <Search className="w-16 h-16 mb-4 text-stone-300" />
                <p className="text-lg font-medium text-stone-500">No matching designs found</p>
                <p className="text-sm mt-2">Try adjusting your search keywords.</p>
                <button 
                  onClick={() => setSearchQuery('')}
                  className="mt-6 px-6 py-2 bg-stone-100 text-stone-600 rounded-lg font-medium hover:bg-stone-200 transition-colors"
                >
                  Clear Search
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDesigns.map((design) => (
                  <div key={design.id} className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden flex flex-col">
                    <div className="h-48 overflow-hidden relative group">
                      <img 
                        src={design.image} 
                        alt="Saved Design" 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute top-3 right-3">
                        <button 
                          onClick={() => deleteDesign(design.id)}
                          className="p-2 bg-white/90 text-red-600 rounded-full shadow-sm hover:bg-red-50 transition-colors"
                          title="Delete Design"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                          {design.preferences.style}
                        </span>
                        <span className="text-xs text-stone-400">
                          {new Date(design.date).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-stone-600 mb-4 flex-1 line-clamp-3">
                        {design.preferences.size} • {design.preferences.climate} • {design.preferences.colors}
                      </p>
                      <button 
                        onClick={() => {
                          setGardenImage(design.image);
                          setGardenPlan(design.plan);
                          setStyle(design.preferences.style);
                          setClimate(design.preferences.climate);
                          setSize(design.preferences.size);
                          setColors(design.preferences.colors);
                          setActiveTab('create');
                        }}
                        className="w-full py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                      >
                        View Full Design
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'wishlist' ? (
          /* Wishlist Tab */
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-stone-200 pb-4">
              <h2 className="text-2xl font-semibold text-emerald-900">Plant Wishlist</h2>
            </div>

            {wishlist.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-stone-400">
                <Heart className="w-16 h-16 mb-4 text-stone-300" />
                <p className="text-lg font-medium text-stone-500">Your wishlist is empty</p>
                <p className="text-sm mt-2">Generate a garden and click the heart icon on plants you love.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {wishlist.map((plant) => (
                  <div key={plant.id} className="border border-stone-200 rounded-xl p-5 bg-white relative group shadow-sm hover:shadow-md transition-shadow">
                    <div className="absolute top-4 right-4 flex gap-1">
                      <button 
                        onClick={() => toggleWishlist(plant)}
                        className="p-1.5 rounded-md transition-colors bg-pink-50 text-pink-600 hover:bg-pink-100 shadow-sm"
                        title="Remove from Wishlist"
                      >
                        <Heart className="w-4 h-4 fill-current" />
                      </button>
                    </div>
                    
                    <h5 className="font-semibold text-stone-800 pr-12 text-lg">{plant.commonName}</h5>
                    <p className="text-sm text-stone-500 italic mb-4">{plant.scientificName}</p>
                    
                    <div className="space-y-3 text-sm">
                      <div className="flex items-start gap-3">
                        <Droplets className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <span className="text-stone-600">{plant.wateringNeeds}</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <Sun className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span className="text-stone-600">{plant.sunlightRequirements}</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <Flower2 className="w-4 h-4 text-pink-400 shrink-0 mt-0.5" />
                        <span className="text-stone-600">{plant.bloomTime}</span>
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-stone-200/60">
                      <button
                        onClick={() => setSelectedCareGuide(plant)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium"
                      >
                        <BookOpen className="w-4 h-4" />
                        View Care Guide
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Reminders Tab */
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-stone-200 pb-4">
              <h2 className="text-2xl font-semibold text-emerald-900">Care Reminders</h2>
            </div>

            {reminders.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-stone-400">
                <Bell className="w-16 h-16 mb-4 text-stone-300" />
                <p className="text-lg font-medium text-stone-500">No reminders set</p>
                <p className="text-sm mt-2">Generate a garden and add reminders from the plant palette.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reminders.sort((a, b) => a.nextDue - b.nextDue).map(reminder => {
                  const isOverdue = reminder.nextDue <= Date.now();
                  return (
                    <div key={reminder.id} className={`bg-white rounded-xl shadow-sm border p-5 flex flex-col gap-4 ${isOverdue ? 'border-red-200 bg-red-50/30' : 'border-stone-200'}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-full ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {reminder.taskType === 'Watering' || reminder.taskType === 'Misting' ? <Droplets className="w-6 h-6" /> : <Leaf className="w-6 h-6" />}
                          </div>
                          <div>
                            <h3 className="font-semibold text-stone-800 text-lg">{reminder.plantName}</h3>
                            <p className="text-stone-600 font-medium">{reminder.taskType} • Every {reminder.frequencyDays} days</p>
                            <p className={`text-sm mt-1 flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : 'text-stone-500'}`}>
                              <Calendar className="w-3.5 h-3.5" />
                              {isOverdue ? 'Due Now' : `Due: ${new Date(reminder.nextDue).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex sm:flex-col gap-2">
                          <button 
                            onClick={() => markReminderDone(reminder.id)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Mark Done
                          </button>
                          <button 
                            onClick={() => deleteReminder(reminder.id)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white border border-stone-200 text-stone-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-lg text-sm font-medium transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </div>
                      
                      {/* Care History Section */}
                      {reminder.history && reminder.history.length > 0 && (
                        <div className="mt-2 pt-4 border-t border-stone-100">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">Care History</h4>
                          <ul className="space-y-1.5">
                            {reminder.history.map((timestamp, idx) => (
                              <li key={idx} className="text-sm text-stone-600 flex items-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                <span>Completed on <span className="font-medium">{new Date(timestamp).toLocaleDateString()}</span> at {new Date(timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Reminder Modal */}
      <AnimatePresence>
        {isReminderModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-stone-100">
                <h3 className="text-xl font-semibold text-emerald-900">Add Care Reminder</h3>
                <button onClick={() => setIsReminderModalOpen(false)} className="text-stone-400 hover:text-stone-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-600 mb-1">Plant</label>
                  <input type="text" value={selectedPlantForReminder} disabled className="w-full bg-stone-100 border border-stone-200 rounded-lg px-4 py-2 text-stone-600 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-600 mb-1">Task</label>
                  <select value={reminderTask} onChange={e => setReminderTask(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none">
                    <option value="Watering">Watering</option>
                    <option value="Fertilizing">Fertilizing</option>
                    <option value="Pruning">Pruning</option>
                    <option value="Misting">Misting</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-600 mb-1">Frequency</label>
                  <select value={reminderFrequency} onChange={e => setReminderFrequency(Number(e.target.value))} className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none">
                    <option value={1}>Every Day</option>
                    <option value={2}>Every 2 Days</option>
                    <option value={3}>Every 3 Days</option>
                    <option value={7}>Once a Week</option>
                    <option value={14}>Every 2 Weeks</option>
                    <option value={30}>Once a Month</option>
                  </select>
                </div>
                <button onClick={saveReminder} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-lg transition-colors">
                  Save Reminder
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Care Guide Modal */}
      <AnimatePresence>
        {selectedCareGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-6 border-b border-stone-100 bg-emerald-50/50 shrink-0">
                <div>
                  <h3 className="text-xl font-semibold text-emerald-900">{selectedCareGuide.commonName}</h3>
                  <p className="text-sm text-emerald-700 italic">{selectedCareGuide.scientificName}</p>
                </div>
                <button 
                  onClick={() => setSelectedCareGuide(null)}
                  className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6 overflow-y-auto">
                {selectedCareGuide.careGuide ? (
                  <>
                    <div className="space-y-2">
                      <h4 className="flex items-center gap-2 font-medium text-stone-800">
                        <Bug className="w-4 h-4 text-red-500" />
                        Common Pests
                      </h4>
                      <p className="text-stone-600 text-sm leading-relaxed">{selectedCareGuide.careGuide.pests}</p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="flex items-center gap-2 font-medium text-stone-800">
                        <Leaf className="w-4 h-4 text-amber-500" />
                        Diseases
                      </h4>
                      <p className="text-stone-600 text-sm leading-relaxed">{selectedCareGuide.careGuide.diseases}</p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="flex items-center gap-2 font-medium text-stone-800">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        Preventative Care
                      </h4>
                      <p className="text-stone-600 text-sm leading-relaxed">{selectedCareGuide.careGuide.preventativeCare}</p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="flex items-center gap-2 font-medium text-stone-800">
                        <Sparkles className="w-4 h-4 text-blue-500" />
                        Treatment Tips
                      </h4>
                      <p className="text-stone-600 text-sm leading-relaxed">{selectedCareGuide.careGuide.treatmentTips}</p>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    {/* Fallback for older saved designs */}
                    {selectedCareGuide.commonIssues && (
                      <div className="space-y-2">
                        <h4 className="flex items-center gap-2 font-medium text-stone-800">
                          <Bug className="w-4 h-4 text-red-500" />
                          Common Issues
                        </h4>
                        <p className="text-stone-600 text-sm leading-relaxed">{selectedCareGuide.commonIssues}</p>
                      </div>
                    )}
                    {selectedCareGuide.careTips && (
                      <div className="space-y-2">
                        <h4 className="flex items-center gap-2 font-medium text-stone-800">
                          <Sparkles className="w-4 h-4 text-blue-500" />
                          Care Tips
                        </h4>
                        <p className="text-stone-600 text-sm leading-relaxed">{selectedCareGuide.careTips}</p>
                      </div>
                    )}
                    {!selectedCareGuide.commonIssues && !selectedCareGuide.careTips && (
                      <p className="text-stone-500 italic text-center py-4">Detailed care guide not available for this plant.</p>
                    )}
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-stone-100 bg-stone-50 flex justify-end shrink-0">
                <button
                  onClick={() => setSelectedCareGuide(null)}
                  className="px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-lg hover:bg-stone-50 font-medium text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
