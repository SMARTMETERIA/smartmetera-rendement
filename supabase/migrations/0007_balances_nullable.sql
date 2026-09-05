-- balance_inputs peut être alimentée progressivement par plusieurs sources
-- (ex. export facturation JVS pour v_comptabilise, télérelève pour
-- v_produit) : tant que v_produit+v_importe = 0, le rendement (et les
-- indicateurs qui en dépendent) est légitimement incalculable, pas une
-- erreur. recalculer_balance() le gérait déjà via nullif() côté calcul,
-- mais les colonnes étaient NOT NULL et rejetaient le résultat NULL.

alter table public.balances
  alter column rendement drop not null,
  alter column ilp drop not null,
  alter column ilc drop not null,
  alter column seuil_reglementaire drop not null,
  alter column conforme_decret drop not null;
