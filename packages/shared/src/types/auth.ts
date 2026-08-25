export type UserProfile = {
  id: string;
  username: string;
  isPublic: boolean;
  createdAt: string;
};

export type AuthResponse = {
  user: UserProfile;
  token: string;
};

export type RegisterRequest = {
  username: string;
  password: string;
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type UpdatePrivacyRequest = {
  isPublic: boolean;
};
