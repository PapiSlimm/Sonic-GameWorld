import { DiscoveryExperience } from '../src/components/discovery/DiscoveryExperience.js';
import { searchProducts } from '../src/lib/data.js';

export default async function HomePage() {
  const { items: products } = await searchProducts({ limit: 24, sort: 'NEWEST' });
  return <DiscoveryExperience products={products} />;
}
