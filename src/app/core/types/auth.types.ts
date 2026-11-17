// === Auth Response (from SSO cookie) ===

export interface AuthResponse {
  id?: number
  uid?: string
  user_name?: string
  user_phone?: string
  user_img?: string
  role_id?: number
  role?: string
  setting?: Setting
  status?: Status
  cust_id?: string
  kc_id?: string
}

export interface Setting {
  is_read_only: boolean
  type_acc: string
  account_id: number
  account_name?: string
}

export interface Status {
  success: boolean
  message?: string
}

// === Auth Information Data (from API) ===

export interface AuthInformationData {
  activities: Activity[]
  avatar: string
  email?: string
}

export interface Activity {
  id: number
  activity: string
  state: string
  description: string
  category: string
}

// === Account ===

export interface Account {
  id: number
  account_name: string
  company_name?: string
}
