import { createContext, useContext, type ReactNode } from 'react';
import { en, type Messages } from './en.js';

interface Language {
  readonly messages: Messages;
  /** A BCP 47 tag such as `en` or `es-ES`, used to format dates and to pick labels. */
  readonly locale: string;
}

const LanguageContext = createContext<Language>({ messages: en, locale: 'en' });

export interface MessagesProviderProps extends Partial<Language> {
  readonly children: ReactNode;
}

export function MessagesProvider({ messages = en, locale = 'en', children }: MessagesProviderProps) {
  return <LanguageContext value={{ messages, locale }}>{children}</LanguageContext>;
}

/** The editor's words in the current language. */
export function useMessages(): Messages {
  return useContext(LanguageContext).messages;
}

/** The language the editor is shown in. */
export function useLocale(): string {
  return useContext(LanguageContext).locale;
}
