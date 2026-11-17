import { Injectable } from '@angular/core'
import { MessageService } from 'primeng/api'

@Injectable({
  providedIn: 'root',
})
export class MessageEdgeService {
  constructor(private readonly messageService: MessageService) {}

  showError(error: string) {
    this.messageService.add({
      severity: 'error',
      summary: 'Error',
      detail: error,
    })
  }

  showSuccess(success: string) {
    this.messageService.add({
      severity: 'success',
      summary: 'Success',
      detail: success,
    })
  }

  showInfo(info: string) {
    this.messageService.add({ severity: 'info', summary: 'Info', detail: info })
  }

  showWarn(warn: string) {
    this.messageService.add({
      severity: 'warn',
      summary: 'Warning',
      detail: warn,
    })
  }
}
