export type UserProfile = {
  id: string;
  username: string;
  isPublic: boolean;
  publicKey?: string | null;
  createdAt: string;
};

export type AuthResponse = {
  user: UserProfile;
  token: string;
};

export type RegisterRequest = {
  username: string;
  password: string;
  publicKey?: string;
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type UpdatePrivacyRequest = {
  isPublic: boolean;
};

export type UpdatePublicKeyRequest = {
  publicKey: string;
};
