import { Component, Output, EventEmitter, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ToastService } from '../../core/toast.service';
import { CustomModel, DEFAULT_CUSTOM_MODELS, DEFAULT_ECONOMY_MODELS, getCustomModels, saveCustomModels, getCustomEconomyModels, saveCustomEconomyModels } from '../../core/openrouter';

@Component({
  selector: 'app-api-key-modal',
  imports: [FormsModule, MatIconModule],
  template: `
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 selection:bg-indigo-100 selection:text-indigo-900 animate-fade-in" tabindex="0" (click)="triggerClose()" (keydown.escape)="triggerClose()" [class.animate-fade-out]="isClosing()">
      <div role="presentation" tabindex="-1" (keyup.enter)="$event.stopPropagation()" class="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-zoom-in cursor-default" (click)="$event.stopPropagation()" [class.animate-zoom-out]="isClosing()">
        <!-- Header -->
        <div class="p-6 border-b border-zinc-100 flex justify-between items-center bg-white">
          <div class="flex items-center space-x-2.5">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <mat-icon>vpn_key</mat-icon>
            </div>
            <div>
              <h3 class="text-lg font-bold text-zinc-900 tracking-tight">Cấu hình OpenRouter API Key & Models</h3>
            </div>
          </div>
          <button (click)="triggerClose()" class="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors rounded-full hover:bg-zinc-200 cursor-pointer border-none bg-transparent focus:outline-none">
            <mat-icon class="!text-[20px] !w-5 !h-5 !flex !items-center !justify-center">close</mat-icon>
          </button>
        </div>
        
        <!-- Content -->
        <div class="p-6 space-y-5 overflow-y-auto bg-white">
          <p class="text-sm text-zinc-600 leading-relaxed">
            Ứng dụng kết nối trực tiếp với OpenRouter API. Bạn có thể tự do cấu hình danh sách các mô hình AI mong muốn bên dưới.
          </p>

          <!-- Status badge/links -->
          <div class="flex items-center space-x-2.5 text-xs text-zinc-500 bg-zinc-50 border border-zinc-100 p-2.5 rounded-xl">
            @if (hasSavedKey()) {
              <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                Đang dùng OpenRouter Key của bạn
              </span>
            } @else {
              <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-750 border border-indigo-100">
                Bạn chưa nhập OpenRouter API Key
              </span>
            }
            <span class="text-zinc-350">|</span>
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-750 font-bold hover:underline flex items-center cursor-pointer no-underline">
              <mat-icon class="!text-[14px] !w-3.5 !h-3.5 mr-1 text-indigo-500">help_outline</mat-icon>Nơi lấy API Key OpenRouter
            </a>
          </div>

          <div class="space-y-1.5">
            <label for="openrouterApiKey" class="block text-xs font-bold text-zinc-400 uppercase tracking-widest">
              OPENROUTER API KEY CÁ NHÂN
            </label>
            <div class="relative flex items-center">
              <input id="openrouterApiKey" 
                     [type]="showKey() ? 'text' : 'password'" 
                     [(ngModel)]="apiKey" 
                     placeholder="sk-or-v1-..." 
                     (keydown.enter)="saveKey()"
                     class="w-full pl-4 pr-11 py-2.5 border border-zinc-305 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm tracking-wide font-mono transition-shadow outline-none text-zinc-800 bg-zinc-50 focus:bg-white">
              <button (click)="toggleShowKey()" 
                      type="button"
                      class="absolute right-3 text-zinc-450 hover:text-zinc-650 transition-colors p-1 rounded-md focus:outline-none flex items-center justify-center border-none bg-transparent cursor-pointer">
                <mat-icon class="text-[20px]">{{ showKey() ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </div>
            <p class="text-[11px] text-zinc-450 leading-relaxed">
              Khóa API được lưu <em class="not-italic font-semibold text-zinc-600">cục bộ tuyệt đối</em> trong trình duyệt (<code class="bg-zinc-100 px-1 py-0.5 rounded text-zinc-700">LocalStorage</code>).
            </p>
          </div>

          <!-- Divider -->
          <div class="h-px bg-zinc-200 my-2"></div>

          <!-- Quality Custom Models List Config -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <div class="block text-xs font-bold text-zinc-800 uppercase tracking-wider">
                  DANH SÁCH MÔ HÌNH AI CHẤT LƯỢNG (TỐI ĐA 5 MODEL)
                </div>
                <p class="text-[11px] text-zinc-500 mt-0.5">
                  Nhập mã model từ OpenRouter (VD: <code class="bg-zinc-100 px-1 py-0.5 rounded text-zinc-700">~google/gemini-flash-latest</code>) dùng cho dịch thuật chính thức, phân tích đại từ & từ khó.
                </p>
              </div>
              <button type="button" (click)="resetDefaultModels()" class="text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline bg-transparent border-none cursor-pointer">
                Khôi phục mặc định
              </button>
            </div>

            <div class="space-y-2">
              @for (model of models(); track $index) {
                <div class="flex items-center space-x-2 bg-zinc-50 p-2 rounded-xl border border-zinc-200">
                  <span class="text-xs font-bold text-zinc-400 w-4 text-center">{{ $index + 1 }}</span>
                  <div class="flex items-center space-x-1">
                    <button 
                      type="button" 
                      (click)="moveModelUp($index)" 
                      [disabled]="$first"
                      class="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-indigo-600 hover:bg-zinc-200/60 rounded-lg disabled:opacity-20 disabled:hover:bg-transparent border-none bg-transparent cursor-pointer transition-colors"
                      title="Di chuyển lên"
                    >
                      <mat-icon class="!text-[22px] !w-5.5 !h-5.5">keyboard_arrow_up</mat-icon>
                    </button>
                    <button 
                      type="button" 
                      (click)="moveModelDown($index)" 
                      [disabled]="$last"
                      class="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-indigo-600 hover:bg-zinc-200/60 rounded-lg disabled:opacity-20 disabled:hover:bg-transparent border-none bg-transparent cursor-pointer transition-colors"
                      title="Di chuyển xuống"
                    >
                      <mat-icon class="!text-[22px] !w-5.5 !h-5.5">keyboard_arrow_down</mat-icon>
                    </button>
                  </div>
                  <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input 
                      type="text" 
                      [(ngModel)]="model.id" 
                      placeholder="Mã model (vd: ~google/gemini-flash-latest)" 
                      class="px-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs font-mono text-zinc-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <input 
                      type="text" 
                      [(ngModel)]="model.name" 
                      placeholder="Tên hiển thị (vd: Google Gemini Flash Latest)" 
                      class="px-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs text-zinc-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <button 
                    type="button" 
                    (click)="removeModel($index)" 
                    class="w-7 h-7 text-zinc-400 hover:text-red-600 flex items-center justify-center rounded-md hover:bg-red-50 border-none bg-transparent cursor-pointer"
                    title="Xóa model này"
                  >
                    <mat-icon class="!text-[18px] !w-4.5 !h-4.5">delete</mat-icon>
                  </button>
                </div>
              }
            </div>

            @if (models().length < 5) {
              <button 
                type="button" 
                (click)="addModel()" 
                class="w-full py-2 border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50/50 hover:border-indigo-400 font-medium rounded-xl text-xs transition-all flex items-center justify-center gap-1 cursor-pointer bg-transparent"
              >
                <mat-icon class="!text-[16px] !w-4 !h-4">add</mat-icon>
                Thêm mô hình chất lượng
              </button>
            }
          </div>

          <!-- Divider -->
          <div class="h-px bg-zinc-200 my-2"></div>

          <!-- Economy Custom Models List Config -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <div class="block text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                  <mat-icon class="!text-[16px] !w-4 !h-4 text-amber-600">savings</mat-icon>
                  <span>DANH SÁCH MÔ HÌNH AI TIẾT KIỆM (TỐI ĐA 2 MODEL)</span>
                </div>
                <p class="text-[11px] text-zinc-500 mt-0.5">
                  Dùng riêng cho việc chuyển đổi PDF sang Markdown và quét mã nguồn sách để chia khối.
                </p>
              </div>
            </div>

            <div class="space-y-2">
              @for (model of economyModels(); track $index) {
                <div class="flex items-center space-x-2 bg-amber-50/50 p-2 rounded-xl border border-amber-200/80">
                  <span class="text-xs font-bold text-amber-500 w-4 text-center">{{ $index + 1 }}</span>
                  <div class="flex items-center space-x-1">
                    <button 
                      type="button" 
                      (click)="moveEconomyModelUp($index)" 
                      [disabled]="$first"
                      class="w-7 h-7 flex items-center justify-center text-amber-600 hover:text-amber-800 hover:bg-amber-100/70 rounded-lg disabled:opacity-20 disabled:hover:bg-transparent border-none bg-transparent cursor-pointer transition-colors"
                      title="Di chuyển lên"
                    >
                      <mat-icon class="!text-[22px] !w-5.5 !h-5.5">keyboard_arrow_up</mat-icon>
                    </button>
                    <button 
                      type="button" 
                      (click)="moveEconomyModelDown($index)" 
                      [disabled]="$last"
                      class="w-7 h-7 flex items-center justify-center text-amber-600 hover:text-amber-800 hover:bg-amber-100/70 rounded-lg disabled:opacity-20 disabled:hover:bg-transparent border-none bg-transparent cursor-pointer transition-colors"
                      title="Di chuyển xuống"
                    >
                      <mat-icon class="!text-[22px] !w-5.5 !h-5.5">keyboard_arrow_down</mat-icon>
                    </button>
                  </div>
                  <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input 
                      type="text" 
                      [(ngModel)]="model.id" 
                      placeholder="Mã model (vd: google/gemini-3.1-flash-lite)" 
                      class="px-2.5 py-1.5 border border-amber-200 rounded-lg text-xs font-mono text-zinc-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <input 
                      type="text" 
                      [(ngModel)]="model.name" 
                      placeholder="Tên hiển thị (vd: Google Gemini 3.1 Flash Lite)" 
                      class="px-2.5 py-1.5 border border-amber-200 rounded-lg text-xs text-zinc-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <button 
                    type="button" 
                    (click)="removeEconomyModel($index)" 
                    class="w-7 h-7 text-zinc-400 hover:text-red-600 flex items-center justify-center rounded-md hover:bg-red-50 border-none bg-transparent cursor-pointer"
                    title="Xóa model này"
                  >
                    <mat-icon class="!text-[18px] !w-4.5 !h-4.5">delete</mat-icon>
                  </button>
                </div>
              }
            </div>

            @if (economyModels().length < 2) {
              <button 
                type="button" 
                (click)="addEconomyModel()" 
                class="w-full py-2 border border-dashed border-amber-300 text-amber-700 hover:bg-amber-50/50 hover:border-amber-400 font-medium rounded-xl text-xs transition-all flex items-center justify-center gap-1 cursor-pointer bg-transparent"
              >
                <mat-icon class="!text-[16px] !w-4 !h-4">add</mat-icon>
                Thêm mô hình tiết kiệm
              </button>
            }
          </div>
        </div>

        <!-- Actions -->
        <div class="p-4 bg-zinc-50 border-t border-zinc-100 flex justify-between items-center shrink-0">
          <div>
            @if (hasSavedKey()) {
              <button (click)="deleteKey()" 
                      class="px-3.5 py-1.5 bg-white border border-red-200 text-red-600 font-medium hover:bg-red-50 hover:border-red-300 rounded-lg transition-all shadow-sm focus:ring-2 focus:ring-red-100 focus:outline-none text-xs cursor-pointer">
                Xóa Key cá nhân
              </button>
            }
          </div>
          <div class="flex space-x-2">
            <button (click)="triggerClose()" 
                    class="px-4 py-1.5 bg-white border border-zinc-300 text-zinc-700 font-medium hover:bg-zinc-100 rounded-lg transition-colors shadow-sm focus:ring-2 focus:ring-zinc-200 focus:outline-none text-xs cursor-pointer">
              Hủy
            </button>
            <button (click)="saveKey()" 
                    [disabled]="!apiKey.trim()"
                    [class.opacity-50]="!apiKey.trim()"
                    [class.cursor-not-allowed]="!apiKey.trim()"
                    class="px-4 py-1.5 bg-indigo-600 text-white font-medium hover:bg-indigo-700 rounded-lg shadow-sm transition-all focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 text-xs cursor-pointer border-none">
              Lưu cấu hình
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ApiKeyModal {
  @Output() closeModal = new EventEmitter<void>();
  private toast = inject(ToastService);
  
  isClosing = signal(false);
  showKey = signal(false);
  apiKey = '';
  hasSavedKey = signal(false);
  models = signal<CustomModel[]>([]);
  economyModels = signal<CustomModel[]>([]);

  constructor() {
    this.checkSavedKey();
    this.models.set(getCustomModels().map(m => ({ ...m })));
    this.economyModels.set(getCustomEconomyModels().map(m => ({ ...m })));
  }

  addModel() {
    if (this.models().length < 5) {
      this.models.update(list => [...list, { id: '', name: '' }]);
    }
  }

  removeModel(index: number) {
    this.models.update(list => list.filter((_, i) => i !== index));
  }

  moveModelUp(index: number) {
    if (index <= 0) return;
    this.models.update(list => {
      const newList = [...list];
      const temp = newList[index];
      newList[index] = newList[index - 1];
      newList[index - 1] = temp;
      return newList;
    });
  }

  moveModelDown(index: number) {
    if (index >= this.models().length - 1) return;
    this.models.update(list => {
      const newList = [...list];
      const temp = newList[index];
      newList[index] = newList[index + 1];
      newList[index + 1] = temp;
      return newList;
    });
  }

  addEconomyModel() {
    if (this.economyModels().length < 2) {
      this.economyModels.update(list => [...list, { id: '', name: '' }]);
    }
  }

  removeEconomyModel(index: number) {
    this.economyModels.update(list => list.filter((_, i) => i !== index));
  }

  moveEconomyModelUp(index: number) {
    if (index <= 0) return;
    this.economyModels.update(list => {
      const newList = [...list];
      const temp = newList[index];
      newList[index] = newList[index - 1];
      newList[index - 1] = temp;
      return newList;
    });
  }

  moveEconomyModelDown(index: number) {
    if (index >= this.economyModels().length - 1) return;
    this.economyModels.update(list => {
      const newList = [...list];
      const temp = newList[index];
      newList[index] = newList[index + 1];
      newList[index + 1] = temp;
      return newList;
    });
  }

  resetDefaultModels() {
    this.models.set(DEFAULT_CUSTOM_MODELS.map(m => ({ ...m })));
    this.economyModels.set(DEFAULT_ECONOMY_MODELS.map(m => ({ ...m })));
    this.toast.info('Đã khôi phục danh sách model mặc định.');
  }

  checkSavedKey() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('user_openrouter_api_key') || localStorage.getItem('user_gemini_api_key');
      this.hasSavedKey.set(!!(saved && saved.trim() !== ''));
      if (saved) {
        this.apiKey = saved;
      } else {
        this.apiKey = '';
      }
    }
  }

  toggleShowKey() {
    this.showKey.update(v => !v);
  }

  triggerClose() {
    this.isClosing.set(true);
    setTimeout(() => {
      this.closeModal.emit();
    }, 200);
  }

  saveKey() {
    const trimmed = this.apiKey.trim();
    if (!trimmed) return;
    
    if (!/^[a-zA-Z0-9_\-.:/]+$/.test(trimmed)) {
      this.toast.error('API Key không hợp lệ. Hãy đảm bảo bạn không dán nhầm chữ tiếng Việt có dấu, khoảng trắng hay ký tự đặc biệt.');
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('user_openrouter_api_key', trimmed);
      localStorage.setItem('user_gemini_api_key', trimmed);
      saveCustomModels(this.models());
      saveCustomEconomyModels(this.economyModels());
      window.dispatchEvent(new Event('api-key-changed'));
      this.toast.success('Đã lưu cấu hình OpenRouter API Key & Danh sách Model thành công!');
    }
    this.triggerClose();
  }

  deleteKey() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user_openrouter_api_key');
      localStorage.removeItem('user_gemini_api_key');
      window.dispatchEvent(new Event('api-key-changed'));
      this.toast.success('Xóa OpenRouter API Key cá nhân thành công.');
    }
    this.triggerClose();
  }
}
