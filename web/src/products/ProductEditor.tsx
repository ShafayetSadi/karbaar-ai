import { useParams } from 'react-router-dom';
import { ExistingProduct } from './editor/ExistingProduct';
import { NewProduct } from './editor/NewProduct';

export function ProductEditor() {
  const { productId } = useParams();
  if (!productId) return <NewProduct />;
  return <ExistingProduct productId={productId} />;
}
