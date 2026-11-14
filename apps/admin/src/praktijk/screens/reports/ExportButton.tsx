import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { PkIcon } from '../../icons';
import { downloadCsv } from '../../kit';

/** "Exporteer": downloads the report as a CSV that Excel opens directly; the rows are built only when clicked. */
export function ExportButton({ file, rows, label }: { file: string; rows: () => (string | number)[][]; label?: string }) {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  return (
    <button
      className="btn btn-ghost btn-small"
      onClick={() => {
        downloadCsv(file, rows());
        demo(t('pk.rapportages.exported', { file }));
      }}
    >
      <PkIcon name="download" size={14} />
      {label ?? t('pk.rapportages.export')}
    </button>
  );
}
