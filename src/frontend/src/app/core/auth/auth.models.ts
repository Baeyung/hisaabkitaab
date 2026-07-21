export interface User {
  id: string;
  contactNumber: string;
  name: string;
  email: string;
  verified: boolean;
}

export interface SignupRequest {
  name: string;
  contactNumber: string;
  email: string;
  password: string;
}

export interface ApiError {
  status: number;
  error: string;
  message: string;
  path: string;
  fieldErrors?: Record<string, string> | null;
}
