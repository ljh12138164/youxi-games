import type { SaveState } from '../types';

type Props = {
  save: SaveState;
  onReturn: () => void;
};

export function Epilogue({ save, onReturn }: Props) {
  return (
    <div className="setup-backdrop fixed inset-0 z-20 flex items-center justify-center p-6">
      <div className="modal-window max-w-[520px] w-full p-6 sm:p-8 text-center space-y-5 text-[#1a1a1a]">
        <div className="text-[12px] tracking-[0.14em] text-[#0067c0] font-semibold">
          装机夜班 · 收工结业
        </div>
        <h2 className="m-0 text-[26px] sm:text-[30px] font-semibold text-[#1a1a1a]">
          天亮了，尾款已结清
        </h2>
        <div className="space-y-3 text-[14.5px] leading-relaxed text-[#424242]">
          <p className="m-0">
            十六个安装包里的暗格、反话和假按钮都拆穿了，委托人的电脑也保住了清净。
          </p>
          <p className="m-0">
            $7,000.00 尾款已经付清，账户里还剩 <strong className="text-[#0067c0] tabular-nums">${save.balance.toFixed(2)}</strong>，足够买顿像样的早饭。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-lg bg-[#f4f7fb] border border-[#cbd5e1] p-4 text-left text-[13px]">
          <div>
            <div className="text-[#6b6b6b]">通关工单</div>
            <div className="text-[20px] font-semibold tabular-nums mt-0.5">{save.clearedInstallers.length} / 16</div>
          </div>
          <div>
            <div className="text-[#6b6b6b]">结清后余额</div>
            <div className="text-[20px] font-semibold text-[#0067c0] tabular-nums mt-0.5">${save.balance.toFixed(2)}</div>
          </div>
        </div>

        <div className="pt-1">
          <button
            type="button"
            className="ui-btn ui-btn-primary px-6 py-2 text-[14px]"
            onClick={onReturn}
          >
            回到 Outhook Express
          </button>
        </div>
      </div>
    </div>
  );
}
