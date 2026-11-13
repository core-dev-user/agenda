import type { CSSProperties } from "react"
import {
  Apple, ArrowLeftRight, Baby, Bath, BedDouble, Beef, Bike, Book, BookOpen, Brain, Briefcase, Brush, Cake, Calendar, CalendarDays, Camera, Car, Carrot,
  Cat, ChartColumn, CigaretteOff, CircleCheck, Clapperboard, Clock, Cloud, CloudSun, Clover, Code, Coffee, Coins, CreditCard, Croissant, Crosshair, Dog,
  Droplet, Dumbbell, Fish, Flame, Flower2, FolderOpen, Footprints, Gamepad2, Gem, Gift, Glasses, GraduationCap, Guitar, HandCoins, HandHeart, Headphones,
  Heart, House, Image, Keyboard, Languages, Laptop, Leaf, Lightbulb, Link, Monitor, Moon, Mountain, Mouse, Music, Newspaper, Notebook, Package, Palette,
  PawPrint, Pencil, PenLine, PhoneOff, PiggyBank, Pill, Pin, Pizza, Plane, Plug, Printer, Rainbow, Receipt, Rocket, Salad, Sandwich, Scissors, Shirt,
  ShoppingBag, ShoppingBasket, ShoppingCart, Smartphone, Snowflake, Sofa, Sparkles, SprayCan, Star, Stethoscope, StickyNote, Sun, Sunrise, Tag, Target,
  Tent, Timer, TreePalm, TrendingUp, Trophy, Tv, Utensils, Volleyball, Wallet, Watch, Waves, Wine, Wrench, Search, Flower, Circle, Flag, Map, Mic, TriangleAlert, Settings, Lock, Bell, Triangle, MessageCircle, type LucideIcon,
} from "lucide-react"

/** Ícones que o usuário pode escolher (hábitos, listas, matérias, categorias). Guardados como "i:<nome>". */
export const ICONS: Record<string, LucideIcon> = {
  Apple, ArrowLeftRight, Baby, Bath, BedDouble, Beef, Bike, Book, BookOpen, Brain, Briefcase, Brush, Cake, Calendar, CalendarDays, Camera, Car, Carrot,
  Cat, ChartColumn, CigaretteOff, CircleCheck, Clapperboard, Clock, Cloud, CloudSun, Clover, Code, Coffee, Coins, CreditCard, Croissant, Crosshair, Dog,
  Droplet, Dumbbell, Fish, Flame, Flower2, FolderOpen, Footprints, Gamepad2, Gem, Gift, Glasses, GraduationCap, Guitar, HandCoins, HandHeart, Headphones,
  Heart, House, Image, Keyboard, Languages, Laptop, Leaf, Lightbulb, Link, Monitor, Moon, Mountain, Mouse, Music, Newspaper, Notebook, Package, Palette,
  PawPrint, Pencil, PenLine, PhoneOff, PiggyBank, Pill, Pin, Pizza, Plane, Plug, Printer, Rainbow, Receipt, Rocket, Salad, Sandwich, Scissors, Shirt,
  ShoppingBag, ShoppingBasket, ShoppingCart, Smartphone, Snowflake, Sofa, Sparkles, SprayCan, Star, Stethoscope, StickyNote, Sun, Sunrise, Tag, Target,
  Tent, Timer, TreePalm, TrendingUp, Trophy, Tv, Utensils, Volleyball, Wallet, Watch, Waves, Wine, Wrench, Search, Flower, Circle, Flag, Map, Mic, TriangleAlert, Settings, Lock, Bell, Triangle, MessageCircle,
}

/** Emojis antigos (já salvos nos dados) → ícone equivalente, para tudo aparecer com o mesmo visual. */
const FROM_EMOJI: Record<string, string> = {
  "💬": "MessageCircle", "🛒": "ShoppingCart", "🛍️": "ShoppingBag", "🧾": "Receipt", "💳": "CreditCard", "💰": "PiggyBank", "🏷️": "Tag", "🎁": "Gift", "📦": "Package", "🧺": "ShoppingBasket", "🪙": "Coins",
  "🏠": "House", "🛋️": "Sofa", "🛏️": "BedDouble", "🧹": "Brush", "🧼": "SprayCan", "🪴": "Leaf", "🔧": "Wrench", "💡": "Lightbulb", "🧴": "Droplet", "🧻": "Package",
  "🍎": "Apple", "🥦": "Carrot", "🥩": "Beef", "🍞": "Croissant", "🧀": "Croissant", "🍕": "Pizza", "🍔": "Sandwich", "☕": "Coffee", "🍷": "Wine", "🍰": "Cake", "🥗": "Salad", "🍣": "Fish",
  "👕": "Shirt", "👖": "Shirt", "👗": "Shirt", "👟": "Footprints", "🧥": "Shirt", "👜": "ShoppingBag", "🕶️": "Glasses", "💍": "Gem", "⌚": "Watch", "🧢": "Shirt",
  "💻": "Laptop", "🖥️": "Monitor", "🎮": "Gamepad2", "🎧": "Headphones", "📱": "Smartphone", "⌨️": "Keyboard", "🖱️": "Mouse", "📷": "Camera", "🔌": "Plug", "🖨️": "Printer",
  "📚": "BookOpen", "📘": "Book", "📖": "BookOpen", "📝": "PenLine", "✏️": "Pencil", "✍️": "PenLine", "🎓": "GraduationCap", "💼": "Briefcase", "📊": "ChartColumn", "🗂️": "FolderOpen", "📅": "Calendar", "🗓️": "CalendarDays", "🧠": "Brain",
  "✈️": "Plane", "🏖️": "TreePalm", "🏕️": "Tent", "🎬": "Clapperboard", "🎵": "Music", "🎼": "Music", "🎸": "Guitar", "⚽": "Volleyball", "🏋️": "Dumbbell", "💪": "Dumbbell", "🎨": "Palette", "📸": "Camera",
  "💊": "Pill", "🩺": "Stethoscope", "🦷": "Stethoscope", "💆": "HandHeart", "🧘": "Sunrise", "🙏": "HandHeart", "❤️": "Heart", "🐶": "Dog", "🐱": "Cat", "🐾": "PawPrint", "👶": "Baby", "🌸": "Flower2", "🌱": "Leaf", "🌿": "Leaf",
  "⭐": "Star", "🔥": "Flame", "✨": "Sparkles", "✅": "CircleCheck", "📌": "Pin", "🚀": "Rocket", "💎": "Gem", "🎯": "Target", "🌙": "Moon", "😴": "Moon", "☀️": "Sun", "🌞": "Sun", "🌈": "Rainbow", "🍀": "Clover",
  "💧": "Droplet", "🏃": "Footprints", "🚭": "CigaretteOff", "📵": "PhoneOff", "🚗": "Car", "📺": "Tv", "🎉": "Trophy", "💈": "Scissors", "↔️": "ArrowLeftRight", "📈": "TrendingUp", "💸": "Wallet",
  "🌊": "Waves", "☁️": "Cloud", "⛅": "CloudSun", "📰": "Newspaper", "🕐": "Clock", "⏱️": "Timer", "🔗": "Link", "🍽️": "Utensils", "🗻": "Mountain", "❄️": "Snowflake", "🛁": "Bath", "🚲": "Bike", "🔎": "Search", "🔍": "Search", "🥀": "Flower", "🔴": "Circle", "🏁": "Flag", "🗺️": "Map", "🎤": "Mic", "⚠️": "TriangleAlert", "⚠": "TriangleAlert", "⚙️": "Settings", "🔒": "Lock", "🔔": "Bell", "🎭": "Sparkles", "🍂": "Leaf", "🫧": "Droplet", "🍽": "Utensils", "🧩": "Package", "🔺": "Triangle", "🖼️": "Image", "🖼": "Image",
}

export const iconKey = (v?: string | null): string | null => {
  if (!v) return null
  if (v.startsWith("i:")) return ICONS[v.slice(2)] ? v.slice(2) : null
  return FROM_EMOJI[v] ?? FROM_EMOJI[v.replace(/️/g, "")] ?? FROM_EMOJI[v + "️"] ?? null
}

/**
 * Mostra o ícone escolhido pelo usuário: "i:Nome" (Lucide) ou um emoji antigo, convertido para o ícone equivalente
 * quando existe. Emojis sem equivalente continuam aparecendo como texto.
 */
export function Glyph({ v, size = 16, className, style, strokeWidth = 1.9 }: { v?: string | null; size?: number; className?: string; style?: CSSProperties; strokeWidth?: number }) {
  const k = iconKey(v)
  if (k) {
    const I = ICONS[k]
    return <I size={size} className={className} style={style} strokeWidth={strokeWidth} />
  }
  if (!v) return null
  return <span className={className} style={{ fontSize: size, lineHeight: 1, ...style }}>{v}</span>
}

/** Ícone num quadradinho colorido (estilo Ajustes do iPhone). */
export function GlyphTile({ v, icon: I, color = "var(--accent)", size = 26, className }: { v?: string | null; icon?: LucideIcon; color?: string; size?: number; className?: string }) {
  return (
    <span
      className={"inline-flex shrink-0 items-center justify-center " + (className ?? "")}
      style={{
        width: size, height: size, borderRadius: size * 0.3, color: "#fff",
        background: `linear-gradient(160deg, color-mix(in srgb, ${color} 100%, #fff 18%), color-mix(in srgb, ${color} 100%, #000 22%))`,
        boxShadow: `inset 0 1px 0 rgb(255 255 255 / .35), 0 2px 6px -2px color-mix(in srgb, ${color} 60%, transparent)`,
      }}
    >
      {I ? <I size={size * 0.58} strokeWidth={2.1} /> : <Glyph v={v} size={size * 0.58} strokeWidth={2.1} />}
    </span>
  )
}
