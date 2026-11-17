import { inject, Injectable, signal } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { environment } from '../../../../environments/environment'
import {
  AuthUser,
  AuthUserListRequest,
  AuthUserListResponse,
  AuthUserUpdateInput,
  CreateWithInviteCodeRequest,
  InviteUsersDto,
} from './user-account.types'

@Injectable({ providedIn: 'root' })
export class UserAccountService {
  private readonly http = inject(HttpClient)
  private readonly url = environment.URL_API
  // v2 base path for auth users
  private readonly base = `${this.url}v2/authuser`

  // ── Signal para notificar ediciones desde el dialog ───────────────────────
  userUpdated = signal<number>(Date.now())

  notifyUpdate(): void {
    this.userUpdated.set(Date.now())
  }

  // ── List (POST /v2/authuser/list) ─────────────────────────────────────────
  postListFilterUsers = (dto: AuthUserListRequest) =>
    this.http.post<AuthUserListResponse>(`${this.base}/list`, dto)

  // ── Get by ID (GET /v2/authuser/:id) ──────────────────────────────────────
  getById = (id: string) =>
    this.http.get<{ data: AuthUser }>(`${this.base}/${id}`)

  // ── Create (POST /v2/authuser) ────────────────────────────────────────────
  postCreateUser = (user: AuthUser) =>
    this.http.post<AuthUser>(`${this.base}`, user)

  // ── Update (PUT /v2/authuser/:id) ─────────────────────────────────────────
  putUpdateUser = (id: string, dto: AuthUserUpdateInput) =>
    this.http.put<AuthUser>(`${this.base}/${id}`, dto)

  // ── Activate user: PUT /v2/authuser/:id { is_active: true } ──────────────
  activateUser = (id: string) =>
    this.http.put<AuthUser>(`${this.base}/${id}`, {
      is_active: true,
    } as AuthUserUpdateInput)

  // ── Deactivate user: PUT /v2/authuser/:id { is_active: false } ───────────
  deactivateUser = (id: string) =>
    this.http.put<AuthUser>(`${this.base}/${id}`, {
      is_active: false,
    } as AuthUserUpdateInput)

  // ── Delete (DELETE /v2/authuser/:id) — soft-delete (is_active = false) ───
  deleteUser = (id: string) =>
    this.http.delete<{ status: string }>(`${this.base}/${id}`)

  // ── Invitaciones (keyauth) ────────────────────────────────────────────────
  sendInviteOnRegistration = (dto: InviteUsersDto) =>
    this.http.post<unknown>(`${this.url}keyauth/users/invite`, dto)

  resendInvitation = (email: string) =>
    this.http.get<unknown>(`${this.url}keyauth/invitation/${email}/resend`)

  // ── Renew invite code for an existing invited user (EDGE-1357) ───────────
  generateInviteCode = (userId: string) =>
    this.http.post<{ invite_code: string; invite_code_expires_at: string }>(
      `${this.base}/${userId}/renew-invite-code`,
      {}
    )

  // ── Create user + invite code in one call (EDGE-1357) ─────────────────────
  // Replaces the two-step postCreateUser → generateInviteCode flow.
  // No SendGrid, no Keycloak invite — just creates the auth_user record
  // (user_status='invited', sso_id='') and returns the access code atomically.
  createWithInviteCode = (dto: CreateWithInviteCodeRequest) =>
    this.http.post<{ message: string }>(`${this.base}/create-with-invite-code`, dto)

  // ── User profile (self) ───────────────────────────────────────────────────
  /** Uploads a profile image and returns the resulting URL array */
  uploadImage = (formData: FormData) =>
    this.http.post<string[]>(`${this.base}/imageupload`, formData)

  /** Updates the current user’s own profile (name, phone, avatar) */
  putUpdateUserProfile = (profile: {
    user_name?: string
    user_phone?: string
    user_img?: string
  }) =>
    this.http.put<{
      user_name?: string
      user_phone?: string
      user_img?: string
    }>(`${this.base}/byself`, profile)
}
