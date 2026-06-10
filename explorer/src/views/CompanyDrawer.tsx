import type { Company, DataBundle, DrawerSelection } from '../types';

interface Props {
  bundle: DataBundle;
  selection: DrawerSelection;
  onSelectCompany: (slug: string) => void;
  onClose: () => void;
}

function CompanyCard({ company }: { company: Company }) {
  return (
    <div className="company-card">
      <h3>{company.name}</h3>
      <div className="links">
        {company.website && (
          <a href={company.website} target="_blank" rel="noreferrer">
            Website
          </a>
        )}
        <a href={company.yc_profile_url} target="_blank" rel="noreferrer">
          YC profile
        </a>
      </div>
      <div className="chips">
        <span className="chip">{company.batch}</span>
        <span className="chip">{company.phenotype_primary_id}</span>
        <span className="chip">{company.vertical_id}</span>
        {company.business_models.map((bm) => (
          <span key={bm} className="chip">
            {bm}
          </span>
        ))}
      </div>
      {company.one_liner && <p style={{ fontWeight: 500 }}>{company.one_liner}</p>}
      {company.what_they_sell && (
        <p>
          <strong>Sells:</strong> {company.what_they_sell}
        </p>
      )}
      {company.ai_play && (
        <p>
          <strong>AI play:</strong> {company.ai_play}
        </p>
      )}
      {company.description && <p className="desc">{company.description}</p>}
    </div>
  );
}

export function CompanyDrawer({ bundle, selection, onSelectCompany, onClose }: Props) {
  if (!selection) return null;

  if (selection.kind === 'company') {
    const c = bundle.companies[selection.slug];
    if (!c) return <p>Company not found</p>;
    return (
      <>
        <button type="button" onClick={onClose} style={{ marginBottom: 12 }}>
          Close
        </button>
        <CompanyCard company={c} />
      </>
    );
  }

  if (selection.kind === 'companies') {
    return (
      <>
        <button type="button" onClick={onClose} style={{ marginBottom: 12 }}>
          Close
        </button>
        <h3 style={{ marginTop: 0 }}>{selection.title}</h3>
        {selection.slugs.map((slug) => {
          const c = bundle.companies[slug];
          if (!c) return null;
          return (
            <button
              key={slug}
              type="button"
              className="company-list-item"
              onClick={() => onSelectCompany(slug)}
            >
              {c.name}
              <small>{c.one_liner}</small>
            </button>
          );
        })}
      </>
    );
  }

  if (selection.kind === 'gap') {
    return (
      <>
        <button type="button" onClick={onClose} style={{ marginBottom: 12 }}>
          Close
        </button>
        <div className="gap-card">
          <h3>Whitespace opportunity</h3>
          <p>
            <strong>Business model:</strong> {selection.businessModel} —{' '}
            {selection.businessModelLabel}
          </p>
          <p>
            <strong>Vertical:</strong> {selection.verticalLabel}
          </p>
          <p className="desc">
            No YC companies in this batch are mapped to this BM × vertical cell.
          </p>
        </div>
      </>
    );
  }

  if (selection.kind === 'cell') {
    const title = `${selection.count} companies`;
    return (
      <>
        <button type="button" onClick={onClose} style={{ marginBottom: 12 }}>
          Close
        </button>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {selection.isGap && <p className="desc">Empty cell — gap in coverage</p>}
        {selection.slugs.map((slug) => {
          const c = bundle.companies[slug];
          if (!c) return null;
          return (
            <button
              key={slug}
              type="button"
              className="company-list-item"
              onClick={() => onSelectCompany(slug)}
            >
              {c.name}
              <small>{c.one_liner}</small>
            </button>
          );
        })}
      </>
    );
  }

  return null;
}
