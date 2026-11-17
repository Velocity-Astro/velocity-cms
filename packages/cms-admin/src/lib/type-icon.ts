import { Building2, CalendarDays, FileText, HelpCircle, MapPin, MessageCircle, Package, PanelsTopLeft, PenLine, Tag, UserRound, type LucideIcon } from 'lucide-react';

/**
 * An icon for a content type, guessed from its key, so the navigation is not a column of the
 * same icon. Content types will be able to choose their own; until then anything not listed
 * here gets the plain document.
 */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  listings: Building2,
  properties: Building2,
  agents: UserRound,
  team: UserRound,
  people: UserRound,
  authors: UserRound,
  neighborhoods: MapPin,
  locations: MapPin,
  reviews: MessageCircle,
  testimonials: MessageCircle,
  posts: PenLine,
  blog: PenLine,
  pages: PanelsTopLeft,
  products: Package,
  events: CalendarDays,
  faqs: HelpCircle,
  categories: Tag,
};

export const typeIcon = (key: string): LucideIcon => ICONS[key.toLowerCase()] ?? FileText;
