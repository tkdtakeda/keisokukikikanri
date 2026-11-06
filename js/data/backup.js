/* ── バックアップ（JSON の書き出し・読み込み） ──
   IndexedDB はこの PC のこのブラウザの中だけにあるため、定期的な書き出しを促す。 */
(function () {
  'use strict';
  const KK = window.KK;
  const FORMAT = 'keisoku-kiki-kanri';
  const VERSION = 1;

  const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  const dataUrlToBlob = async (url) => (await fetch(url)).blob();

  KK.backupService = {
    lastExport: () => KK.repo.settings.get('lastExport', ''),
    /** 自分で登録したデータがあり、30 日以上書き出していなければ促す */
    needsReminder() {
      if (!KK.repo.assets.list().some((a) => !a.sample)) return false;
      const last = this.lastExport();
      return !last || KK.util.daysBetween(last, KK.util.today()) >= 30;
    },

    /** 書き出し：ファイル名と件数を返す */
    async exportJson() {
      const data = await KK.repo.dumpAll();
      const attachments = await Promise.all(data.attachments.map(async (x) => ({ ...x, blob: undefined, dataUrl: await blobToDataUrl(x.blob) })));
      const doc = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), ...data, attachments };
      const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
      const name = `測定機器台帳_${KK.util.today()}.json`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      await KK.repo.settings.set('lastExport', KK.util.today());
      return { name, size: blob.size, assets: data.assets.length };
    },

    /** 読み込み：内容を検査してから全体を置き換える。取り消し用に元のデータを返す */
    async importJson(file) {
      let doc;
      try { doc = JSON.parse(await file.text()); } catch (e) { throw new Error('JSON として読めませんでした'); }
      if (doc.format !== FORMAT) throw new Error('この台帳の書き出しファイルではありません');
      if (doc.version > VERSION) throw new Error(`新しい版（${doc.version}）のファイルです。ツールを更新してください`);
      ['locations', 'categories', 'assets', 'events'].forEach((k) => { if (!Array.isArray(doc[k])) throw new Error(`「${k}」がありません`); });
      const attachments = await Promise.all((doc.attachments || []).map(async (x) => ({ ...x, dataUrl: undefined, blob: await dataUrlToBlob(x.dataUrl) })));
      const before = await KK.repo.dumpAll();
      await KK.repo.replaceAll({ ...doc, attachments });
      return { before, assets: doc.assets.length, exportedAt: doc.exportedAt };
    },

    undoImport: (before) => KK.repo.replaceAll(before)
  };
})();
