export interface User {
  id: string;
  email: string;
  username: string;
  created_at: string;
}

export interface MoodEntry {
  id: string;
  user_id: string;
  photo_url?: string;
  description: string;
  mood: string;
  likes: string[];
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}