// Reading normalization shared by the settings renderer and main process.
(function(scope){
 function normalizeReading(value){
  if(typeof value!=='string')throw new Error('読みを入力してください。');
  const reading=value.trim().normalize('NFKC').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
  if(reading&&!/^[ぁ-ゖー]+$/u.test(reading))throw new Error('読みはひらがなで入力してください。カタカナは自動変換できます。');
  if(reading.length>120)throw new Error('読みは120文字以内で入力してください。');
  return reading;
 }
 if(typeof module!=='undefined')module.exports={normalizeReading};else scope.dictionaryReading={normalizeReading};
})(typeof window!=='undefined'?window:globalThis);
