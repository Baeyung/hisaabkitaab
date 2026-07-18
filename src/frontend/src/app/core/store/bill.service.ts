import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BillDetail, BillSummary } from './bill.models';

/** Bill reads — every SALE transaction is a bill, served from /transactions/bills. */
@Injectable({ providedIn: 'root' })
export class BillService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/transactions/bills`;

  list(): Promise<BillSummary[]> {
    return firstValueFrom(this.http.get<BillSummary[]>(this.url));
  }

  getDetail(id: string): Promise<BillDetail> {
    return firstValueFrom(this.http.get<BillDetail>(`${this.url}/${id}`));
  }

  /** Delete a bill (SALE); the backend cascades its transaction lines away. */
  delete(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.url}/${id}`));
  }
}
