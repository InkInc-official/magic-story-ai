'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SPEECH_REGISTER_LABELS } from '@/lib/i18n';

export interface CharacterVoiceForm {
  firstPerson: string;
  defaultSecondPerson: string;
  speechRegister: string;
  speechStyleNotes: string;
  narrationVoiceNotes: string;
}

export function CharacterVoiceFields({ value, onChange }: { value: CharacterVoiceForm; onChange: (value: CharacterVoiceForm) => void }) {
  const update = (field: keyof CharacterVoiceForm, next: string) => onChange({ ...value, [field]: next });
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-secondary/20 p-3">
      <div>
        <p className="text-xs font-medium text-foreground">話し方</p>
        <p className="text-[10px] text-muted-foreground">性格とは分けて、台詞と視点人物時の地の文を設定します。</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="block text-xs text-muted-foreground mb-1">一人称</label><Input value={value.firstPerson} onChange={e => update('firstPerson', e.target.value)} placeholder="私、僕、俺など" className="text-sm" /></div>
        <div><label className="block text-xs text-muted-foreground mb-1">基本二人称</label><Input value={value.defaultSecondPerson} onChange={e => update('defaultSecondPerson', e.target.value)} placeholder="あなた、君、お前など" className="text-sm" /></div>
      </div>
      <div><label className="block text-xs text-muted-foreground mb-1">敬語・話し方レベル</label>
        <select value={value.speechRegister} onChange={e => update('speechRegister', e.target.value)} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm text-foreground">
          <option value="">未設定（既存設定と文脈から判断）</option>
          {value.speechRegister && !SPEECH_REGISTER_LABELS[value.speechRegister] && <option value={value.speechRegister}>{value.speechRegister}</option>}
          {Object.entries(SPEECH_REGISTER_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      <div><label className="block text-xs text-muted-foreground mb-1">話し方メモ</label><Textarea value={value.speechStyleNotes} onChange={e => update('speechStyleNotes', e.target.value)} rows={3} placeholder="語尾、語彙、発話長、言い淀み、口癖、感情時の変化など" className="text-sm resize-none" /></div>
      <div><label className="block text-xs text-muted-foreground mb-1">地の文の語り口</label><Textarea value={value.narrationVoiceNotes} onChange={e => update('narrationVoiceNotes', e.target.value)} rows={3} placeholder="この人物が視点人物・語り手になった場合の地の文" className="text-sm resize-none" /></div>
    </div>
  );
}
