import { PlatformPage, type PageSlots } from './PlatformPage';
const slots: PageSlots = { title: '', description: null, primaryAction: null, secondaryActions: null, contextExtension: null, content: null, dataTrustSummary: null };
<PlatformPage {...slots} />;
// @ts-expect-error children are not an extension slot
<PlatformPage {...slots}><header>forbidden global insertion</header></PlatformPage>;
// @ts-expect-error shell header cannot be supplied by a page
<PlatformPage {...slots} header={<header />} />;
// @ts-expect-error every named slot must be explicit, including null slots
<PlatformPage title="Incomplete" />;
