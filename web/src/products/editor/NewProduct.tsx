import { useUrlPanel } from '../../navigation/useUrlPanel';
import { LeaveGuard } from '../../navigation/LeaveGuard';
import { useFilePreviews } from '../useFilePreviews';
import { useQuery } from '@tanstack/react-query';
import { HelpCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { call } from '../../api/call';
import { unwrap } from '../../api/query';
import type { ApiError } from '../../api/errors';
import { uploadImage } from '../../media/uploadImage';
import { useImageUploads } from '../../media/useImageUploads';
import { UploadProgress } from '../../media/UploadProgress';
import {
  ActionButton,
  Field,
  FormError,
  Tooltip,
  actionButtonClass,
  cx,
  fieldClass,
} from '../../components/ui';
import { formatInteger, parseCount, parseKg, parseTaka } from '../../i18n/format';
import {
  buildMatrix,
  builtOptions,
  factsPayload,
  parseAliases,
  type FactDraft,
  type OptionDraft,
} from '../options';
import {
  DEFAULT_TYPE,
  PRODUCT_TYPES,
  presetFactLabels,
  presetOptionNames,
  type ProductType,
} from '../presets';
import { AvailabilityPanel } from '../AvailabilityPanel';
import { DeliveryPanel } from '../DeliveryPanel';
import {
  checkDelivery,
  newDraft as newDeliveryDraft,
  type DeliveryDraft,
  type DeliveryProblem,
} from '../delivery';
import { useDeliveryOptions } from '../useDeliveryOptions';
import {
  IN_STOCK_DRAFT,
  checkAvailability,
  opensAvailability,
  type AvailabilityDraft,
  type AvailabilityProblem,
} from '../availability';
import { DescriptionEditor } from '../DescriptionEditor';
import { FactsPanel } from '../FactsPanel';
import { GalleryModal } from '../GalleryModal';
import { WholesalePanel } from '../WholesalePanel';
import {
  NO_QUANTITY_RULES,
  checkQuantity,
  checkTiers,
  offersWholesale,
  type QuantityDraft,
  type QuantityProblem,
  type TierDraft,
  type TierProblem,
} from '../wholesale';
import { VariantMatrix, type RowEdit, type RowErrors } from '../VariantMatrix';
import { GalleryGrid } from './GalleryGrid';
import { PricingFields } from './PricingFields';
import { MoreOptions, ProductLayout } from './ProductLayout';
import { Panel, OptionRow, MAX_STOCK, MAX_WEIGHT_GRAMS, wholesaleSummary } from './shared';

const isImage = (file: File) =>
  ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'].includes(
    file.type,
  );

export function NewProduct() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const uploads = useImageUploads();
  const bypass = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [type, setType] = useState<ProductType>(DEFAULT_TYPE);
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [basePrice, setBasePrice] = useState('');
  const [weightAll, setWeightAll] = useState('');
  const [regularAll, setRegularAll] = useState('');
  const [regularError, setRegularError] = useState<string>();
  const [facts, setFacts] = useState<FactDraft[]>([]);
  const [avail, setAvail] = useState<AvailabilityDraft>(IN_STOCK_DRAFT);
  const [availProblem, setAvailProblem] = useState<AvailabilityProblem>();
  const [availOpen, setAvailOpen] = useState(false);
  const deliveryOptions = useDeliveryOptions();
  const [delivery, setDelivery] = useState<DeliveryDraft | null>(null);
  const [deliveryProblem, setDeliveryProblem] = useState<DeliveryProblem>();
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [aliases, setAliases] = useState('');
  const [linkId, setLinkId] = useState('');
  const [chart, setChart] = useState<File | null>(null);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [baseError, setBaseError] = useState<string>();
  const [weightError, setWeightError] = useState<string>();
  const [rowErrors, setRowErrors] = useState<Record<string, RowErrors>>({});
  const [noRows, setNoRows] = useState(false);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [quantity, setQuantity] = useState<QuantityDraft>(NO_QUANTITY_RULES);
  const [quantityProblem, setQuantityProblem] = useState<QuantityProblem>();
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [tierProblem, setTierProblem] = useState<TierProblem>();
  const [wholesaleOpen, setWholesaleOpen] = useState(false);

  const [categoryId, setCategoryId] = useState('');
  const [baseSku, setBaseSku] = useState('');
  const [initialStock, setInitialStock] = useState('');
  const [description, setDescription] = useState('');
  const [lengthCm, setLengthCm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [galleryModalOpen, setGalleryModalOpen] = useUrlPanel('gallery');
  const [loadCategories, setLoadCategories] = useState(false);
  const { data: categories = [] } = useQuery({
    queryKey: ['groups', 'categories', 'active'],
    queryFn: async () =>
      unwrap(
        await call(() => api.GET('/v1/categories', { params: { query: { status: 'active' } } })),
      ).items,
    enabled: loadCategories,
  });

  const previewOf = useFilePreviews(files);

  const matrix = buildMatrix(builtOptions(options), parseTaka(basePrice));
  const rows = matrix.rows.filter((row) => !removed.includes(row.key));

  const tracked = avail.availability === 'in_stock' || avail.track;
  // The shared weight is typed in kg; variant rows and the API use whole grams.
  const sharedWeight = weightAll.trim() ? parseKg(weightAll) : undefined;
  // Until the user touches it, every active option is ticked (no limit).
  const deliveryDraft = delivery ?? newDeliveryDraft(deliveryOptions ?? []);

  function chooseType(next: ProductType) {
    setType(next);
    if (opensAvailability(next)) setAvailOpen(true);
    // A preset only fills an untouched option list; it never overwrites what was typed.
    if (options.every((o) => !o.values.trim())) {
      setOptions(presetOptionNames(next).map((name) => ({ name, values: '' })));
    }
  }

  function check(): CheckedRow[] | null {
    const errors: Record<string, RowErrors> = {};
    const checked: CheckedRow[] = [];
    const hasOptions = rows.some((r) => Object.keys(r.option_values).length > 0);
    let baseBad = false;
    let regularBad: string | undefined;
    const weightBad =
      sharedWeight === null ||
      (sharedWeight !== undefined && (sharedWeight < 1 || sharedWeight > MAX_WEIGHT_GRAMS));
    for (const row of rows) {
      const edit = edits[row.key] ?? {};
      const price = parseTaka(edit.price ?? basePrice);
      const regularText = (edit.regular ?? regularAll).trim();
      const regular = regularText ? parseTaka(regularText) : undefined;
      // Untracked products have no stock column: a stale number typed before is not sent.
      const stockText = tracked ? (edit.stock ?? (hasOptions ? '' : initialStock)).trim() : '';
      const stock = stockText ? parseCount(stockText) : undefined;
      const weightText = edit.weight?.trim();
      const weight =
        edit.weight === undefined ? sharedWeight : weightText ? parseCount(weightText) : undefined;
      const rowError: RowErrors = {};
      if (price === null) {
        if (hasOptions && edit.price !== undefined) rowError.price = t('editor.invalidPrice');
        else baseBad = true;
      }
      const regularProblem =
        regular === null
          ? t('editor.invalidPrice')
          : regular !== undefined && price !== null && regular <= price
            ? t('editor.regularNotAbove')
            : undefined;
      if (regularProblem) {
        if (hasOptions) rowError.regular = regularProblem;
        else regularBad = regularProblem;
      }
      if (stock === null || (stock !== undefined && stock > MAX_STOCK)) {
        rowError.stock = t('editor.invalidStock', { max: formatInteger(MAX_STOCK) });
      }
      if (
        edit.weight !== undefined &&
        (weight === null || (weight !== undefined && (weight < 1 || weight > MAX_WEIGHT_GRAMS)))
      ) {
        rowError.weight = t('editor.invalidWeight');
      }
      if (Object.keys(rowError).length) errors[row.key] = rowError;
      if (price !== null && stock !== null && weight !== null && !weightBad && !regularProblem) {
        const lengthMm = lengthCm.trim() ? Math.round(Number(lengthCm) * 10) : undefined;
        const widthMm = widthCm.trim() ? Math.round(Number(widthCm) * 10) : undefined;
        const heightMm = heightCm.trim() ? Math.round(Number(heightCm) * 10) : undefined;
        checked.push({
          option_values: row.option_values,
          price_minor: price,
          compare_at_price_minor: regular ?? undefined,
          sku: (edit.sku ?? (hasOptions ? '' : baseSku)).trim() || null,
          initial_stock: stock,
          weight_grams: weight,
          ...(lengthMm && lengthMm > 0 ? { length_mm: lengthMm } : {}),
          ...(widthMm && widthMm > 0 ? { width_mm: widthMm } : {}),
          ...(heightMm && heightMm > 0 ? { height_mm: heightMm } : {}),
        });
      }
    }
    setBaseError(baseBad ? t('editor.invalidPrice') : undefined);
    setRegularError(regularBad);
    setWeightError(weightBad ? t('editor.invalidWeightKg') : undefined);
    setRowErrors(errors);
    setNoRows(rows.length === 0);
    return baseBad || regularBad || weightBad || Object.keys(errors).length > 0 || rows.length === 0
      ? null
      : checked;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (matrix.overLimit) return;
    const form = new FormData(e.currentTarget);
    const variants = check();
    const availability = checkAvailability(avail);
    setAvailProblem(availability.ok ? undefined : availability.problem);
    if (!availability.ok) setAvailOpen(true);
    const deliveryChecked = checkDelivery(deliveryDraft, deliveryOptions ?? []);
    setDeliveryProblem(deliveryChecked.ok ? undefined : deliveryChecked.problem);
    if (!deliveryChecked.ok) setDeliveryOpen(true);
    const quantityChecked = checkQuantity(quantity);
    setQuantityProblem(quantityChecked.ok ? undefined : quantityChecked.problem);
    // One table for every variant: each tier must be below the cheapest variant's price.
    const lowest = variants?.length ? Math.min(...variants.map((v) => v.price_minor)) : null;
    const tiersChecked = checkTiers(tiers, lowest);
    setTierProblem(tiersChecked.ok ? undefined : tiersChecked.problem);
    if (!quantityChecked.ok || !tiersChecked.ok) setWholesaleOpen(true);
    if (
      !variants ||
      !availability.ok ||
      !deliveryChecked.ok ||
      !quantityChecked.ok ||
      !tiersChecked.ok
    ) {
      return;
    }
    const { delivery_option_ids, ...advance } = deliveryChecked.value;

    setBusy(true);
    const descText = description.trim() || String(form.get('description') ?? '').trim() || null;
    const result = await call(() =>
      api.POST('/v1/products', {
        body: {
          name: String(form.get('name')),
          description: descText,
          aliases: parseAliases(String(form.get('aliases') ?? '')),
          product_type: type,
          // The API requires the field; the demo has no website to show products on.
          show_on_storefront: true,
          ...(categoryId ? { category_id: categoryId } : {}),
          attributes: factsPayload(facts),
          ...availability.value,
          ...advance,
          ...quantityChecked.value,
          variants: variants.map(
            ({
              initial_stock,
              weight_grams,
              compare_at_price_minor,
              length_mm,
              width_mm,
              height_mm,
              ...rest
            }) => ({
              ...rest,
              ...(tiersChecked.value.length > 0 ? { price_tiers: tiersChecked.value } : {}),
              ...(compare_at_price_minor !== undefined && { compare_at_price_minor }),
              ...(initial_stock !== undefined && { initial_stock }),
              ...(weight_grams !== undefined && { weight_grams }),
              ...(length_mm !== undefined && { length_mm }),
              ...(width_mm !== undefined && { width_mm }),
              ...(height_mm !== undefined && { height_mm }),
            }),
          ),
        },
      }),
    );
    if (!result.ok) {
      setBusy(false);
      setApiError(result.error);
      return;
    }
    // The product exists now; a failed link or image must not lose it, so count
    // failures and let the editor tell the merchant.
    const productId = result.data.id;
    let limitFailed = false;
    if (delivery_option_ids.length > 0) {
      const limited = await call(() =>
        api.PUT('/v1/products/{product_id}/delivery-options', {
          params: { path: { product_id: productId } },
          body: { delivery_option_ids },
        }),
      );
      limitFailed = !limited.ok;
    }
    const linkId = String(form.get('link_external_id') ?? '').trim();
    let linkFailed = false;
    if (linkId) {
      const linked = await call(() =>
        api.POST('/v1/products/{product_id}/post-links', {
          params: { path: { product_id: productId } },
          body: {
            kind: form.get('link_kind') === 'ad' ? 'ad' : 'post',
            external_id: linkId,
            permalink: String(form.get('link_permalink') ?? '').trim() || null,
          },
        }),
      );
      linkFailed = !linked.ok;
    }
    let failed = 0;
    await uploads.upload(
      files,
      { code: 'UPLOAD_FAILED', message: t('editor.uploadFailed'), fields: {} },
      async (mediaId) => {
        const attached = await call(() =>
          api.POST('/v1/products/{product_id}/images', {
            params: { path: { product_id: productId } },
            body: { media_id: mediaId, role: 'gallery' },
          }),
        );
        return attached.ok;
      },
      () => {
        failed += 1;
      },
    );
    if (chart) {
      const uploaded = await uploadImage(chart, { code: 'UPLOAD_FAILED', message: '', fields: {} });
      const attached =
        uploaded.ok &&
        (
          await call(() =>
            api.POST('/v1/products/{product_id}/images', {
              params: { path: { product_id: productId } },
              body: { media_id: uploaded.data, role: 'size_chart' },
            }),
          )
        ).ok;
      if (!attached) failed += 1;
    }
    setBusy(false);
    bypass.current = true;
    void navigate(`/products/${productId}`, {
      replace: true,
      state: { imagesFailed: failed, linkFailed, limitFailed },
    });
  }

  const chartControls = (
    <>
      {chart && (
        <p className="flex items-center gap-3 text-sm text-ink">
          <span className="truncate">{chart.name}</span>
          <ActionButton tone="danger" disabled={busy} onClick={() => setChart(null)}>
            {t('editor.removeImage')}
          </ActionButton>
        </p>
      )}
      <label
        className={cx(
          actionButtonClass(),
          'cursor-pointer self-start focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-active',
        )}
      >
        {chart ? t('editor.replaceSizeChart') : t('editor.addSizeChart')}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
          disabled={busy}
          className="sr-only"
          onChange={(e) => {
            setChart(e.target.files?.[0] ?? chart);
            e.target.value = '';
          }}
        />
      </label>
    </>
  );

  const aliasCount = parseAliases(aliases).length;
  const detailsSummary =
    aliasCount + facts.length === 0
      ? t('editor.notSet')
      : [
          aliasCount > 0 && t('editor.aliasCount', { count: aliasCount }),
          facts.length > 0 && t('editor.factCount', { count: facts.length }),
        ]
          .filter(Boolean)
          .join(' · ');

  const submit = (
    <button
      type="submit"
      form="product-create-form"
      disabled={busy || matrix.overLimit}
      aria-label={t('editor.create')}
      className="inline-flex items-center justify-center rounded-lg border border-accent-strong bg-accent px-5 py-2 font-medium text-accent-ink shadow-sm transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-active disabled:opacity-60 cursor-pointer"
    >
      {busy ? t('common.pleaseWait') : t('editor.saveProduct')}
    </button>
  );

  return (
    <>
      <LeaveGuard
        ignoreParams={['menu', 'gallery']}
        dirty={
          dirty ||
          files.length > 0 ||
          chart !== null ||
          description !== '' ||
          options.length > 0 ||
          Object.keys(edits).length > 0
        }
        bypass={bypass}
        message={t('editor.leaveUnsaved')}
      />
      <ProductLayout
        title={t('editor.createBreadcrumb')}
        actions={submit}
        form={{ id: 'product-create-form', onSubmit, onChange: () => setDirty(true) }}
        notices={<FormError error={apiError} />}
        main={
          <>
            <Panel id="product-info" title={t('editor.productInformation')}>
              <Field
                label={`${t('editor.productName')} *`}
                aria-label="Name"
                name="name"
                required
                maxLength={200}
                placeholder={t('editor.namePlaceholder')}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-ink-muted">
                  {t('editor.category')}
                  <select
                    value={categoryId}
                    onFocus={() => setLoadCategories(true)}
                    onClick={() => setLoadCategories(true)}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className={cx('mt-1 block w-full', fieldClass)}
                  >
                    <option value="">{t('editor.selectCategory')}</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <label className="block text-sm font-medium text-ink-muted">
                    {t('editor.type')}
                    <select
                      value={type}
                      onChange={(e) => chooseType(e.target.value as ProductType)}
                      className={cx('mt-1 block w-full', fieldClass)}
                    >
                      {PRODUCT_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {t(`productType.${value}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="mt-1 text-xs text-ink-faint">{t('editor.typeHint')}</p>
                </div>
              </div>
              {offersWholesale(type) && (
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={wholesaleOpen}
                    onChange={(e) => setWholesaleOpen(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{t('wholesale.sellsWholesale')}</span>
                    <span className="block text-ink-muted">
                      {t('wholesale.sellsWholesaleHint')}
                    </span>
                  </span>
                </label>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={t('editor.baseSku')}
                  value={baseSku}
                  onChange={(e) => setBaseSku(e.target.value)}
                  placeholder={t('editor.skuPlaceholder')}
                />
                {tracked ? (
                  <div>
                    <div className="flex items-center gap-1.5">
                      <label
                        htmlFor="initial-stock-input"
                        className="block text-sm font-medium text-ink-muted"
                      >
                        {t('editor.initialStock')}
                      </label>
                      <Tooltip side="top" content={t('editor.initialStockHint')}>
                        <span className="cursor-help text-ink-faint">
                          <HelpCircle aria-hidden className="size-3.5" />
                        </span>
                      </Tooltip>
                    </div>
                    <input
                      id="initial-stock-input"
                      value={initialStock}
                      inputMode="numeric"
                      aria-label="Initial stock"
                      placeholder="1"
                      onChange={(e) => {
                        const val = e.target.value;
                        setInitialStock(val);
                        const key = rows[0]?.key ?? '';
                        setEdits({ ...edits, [key]: { ...edits[key], stock: val } });
                      }}
                      className={cx('mt-1 block w-full', fieldClass)}
                    />
                    {rowErrors['']?.stock && (
                      <span className="mt-1 block text-sm font-normal text-danger-ink">
                        {rowErrors['']?.stock}
                      </span>
                    )}
                  </div>
                ) : null}
              </div>

              <DescriptionEditor value={description} onChange={setDescription} name="description" />
            </Panel>

            <div id="product-variants" className="scroll-mt-36">
              <Panel title={t('editor.variants')} hint={t('editor.variantsSubtitle')}>
                <VariantMatrix
                  showStock={tracked}
                  options={options}
                  onOptions={setOptions}
                  basePrice={basePrice}
                  onBasePrice={setBasePrice}
                  baseError={baseError}
                  regularAll={regularAll}
                  onRegularAll={setRegularAll}
                  regularError={regularError}
                  weightAll={sharedWeight ? String(sharedWeight) : ''}
                  onWeightAll={(grams) => {
                    const g = parseCount(grams);
                    setWeightAll(g === null ? grams : String(g / 1000));
                  }}
                  rows={rows}
                  count={matrix.count}
                  overLimit={matrix.overLimit}
                  edits={edits}
                  onEdit={(key, patch) =>
                    setEdits({ ...edits, [key]: { ...edits[key], ...patch } })
                  }
                  onRemove={(key) => setRemoved([...removed, key])}
                  errors={rowErrors}
                  disabled={busy}
                  hideSharedFields={true}
                />
                {noRows && !matrix.overLimit && (
                  <p role="alert" className="text-sm text-danger-ink">
                    {t('editor.noRows')}
                  </p>
                )}
              </Panel>
            </div>
          </>
        }
        side={
          <>
            <Panel title={t('editor.productGallery')}>
              <UploadProgress items={uploads.pending} onCancel={uploads.cancel} />
              <GalleryGrid
                items={files.map((file, i) => ({
                  key: `${file.name}-${i}`,
                  src: previewOf(file),
                  alt: file.name,
                }))}
                busy={busy}
                onPick={() => setGalleryModalOpen(true)}
                onFiles={(chosen) => setFiles([...files, ...chosen.filter(isImage)])}
                onRemove={(key) => setFiles(files.filter((f, i) => `${f.name}-${i}` !== key))}
              />
            </Panel>

            <Panel id="product-pricing" title={t('editor.pricingShippingSettings')}>
              <PricingFields
                value={{
                  price: basePrice,
                  regular: regularAll,
                  weight: weightAll,
                  length: lengthCm,
                  width: widthCm,
                  height: heightCm,
                }}
                errors={{ price: baseError, regular: regularError, weight: weightError }}
                onChange={(next) => {
                  setBasePrice(next.price);
                  setRegularAll(next.regular);
                  setWeightAll(next.weight);
                  setLengthCm(next.length);
                  setWidthCm(next.width);
                  setHeightCm(next.height);
                }}
              />
            </Panel>
          </>
        }
        more={
          <MoreOptions>
            <OptionRow title={t('editor.assistantDetails')} summary={detailsSummary}>
              <Field
                label={t('editor.aliases')}
                name="aliases"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
              />
              <p className="text-sm text-ink-faint">{t('editor.aliasesHint')}</p>
              <div className="space-y-2 pt-2">
                <h3 className="text-sm font-medium text-ink">{t('editor.facts')}</h3>
                <p className="text-sm text-ink-muted">{t('editor.factsHint')}</p>
                <FactsPanel
                  facts={facts}
                  onChange={setFacts}
                  suggestions={presetFactLabels(type)}
                  disabled={busy}
                />
              </div>
            </OptionRow>

            <OptionRow
              title={t('availability.title')}
              summary={t(`availability.mode.${avail.availability}`)}
              hint={t('availability.hint')}
              open={availOpen}
              onToggle={setAvailOpen}
            >
              <AvailabilityPanel
                draft={avail}
                onChange={setAvail}
                problem={availProblem}
                disabled={busy}
              />
            </OptionRow>

            <OptionRow
              title={t('productDelivery.title')}
              summary={t(`productDelivery.policy.${deliveryDraft.advance}`)}
              hint={t('productDelivery.hint')}
              open={deliveryOpen}
              onToggle={setDeliveryOpen}
            >
              <DeliveryPanel
                draft={deliveryDraft}
                onChange={setDelivery}
                options={deliveryOptions}
                problem={deliveryProblem}
                disabled={busy}
              />
            </OptionRow>

            <OptionRow
              title={t('wholesale.title')}
              summary={wholesaleSummary(t, quantity, tiers.length)}
              hint={t('wholesale.hint')}
              open={wholesaleOpen}
              onToggle={setWholesaleOpen}
            >
              <WholesalePanel
                quantity={quantity}
                onQuantity={setQuantity}
                quantityProblem={quantityProblem}
                tiers={tiers}
                onTiers={setTiers}
                tierProblem={tierProblem}
                disabled={busy}
              />
            </OptionRow>

            <OptionRow
              title={t('editor.sizeChart')}
              summary={chart?.name ?? t('editor.notSet')}
              hint={t('editor.sizeChartHint')}
            >
              {chartControls}
            </OptionRow>

            <OptionRow
              title={t('editor.postLinks')}
              summary={linkId.trim() || t('editor.notSet')}
              hint={t('editor.postLinksCreateHint')}
            >
              <div className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr]">
                <label className="block text-sm font-medium text-ink-muted">
                  {t('editor.linkKind')}
                  <select name="link_kind" className={cx('mt-1 block w-full', fieldClass)}>
                    <option value="post">{t('editor.kindPost')}</option>
                    <option value="ad">{t('editor.kindAd')}</option>
                  </select>
                </label>
                <Field
                  label={t('editor.linkExternalId')}
                  name="link_external_id"
                  maxLength={128}
                  value={linkId}
                  onChange={(e) => setLinkId(e.target.value)}
                />
                <Field
                  label={t('editor.linkPermalink')}
                  name="link_permalink"
                  type="url"
                  maxLength={500}
                />
              </div>
            </OptionRow>
          </MoreOptions>
        }
      />

      {galleryModalOpen && (
        <GalleryModal
          open
          onClose={() => setGalleryModalOpen(false)}
          files={files}
          onFilesChange={setFiles}
        />
      )}
    </>
  );
}

interface CheckedRow {
  option_values: Record<string, string>;
  price_minor: number;
  compare_at_price_minor?: number;
  sku: string | null;
  initial_stock?: number;
  weight_grams?: number;
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;
}
