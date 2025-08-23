import { format } from 'date-fns';
import type { FoodLog } from '@/types';

export function LogCard({ log, onDelete }: { log: FoodLog; onDelete?: (id: string) => void }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{Array.isArray(log.items) ? log.items.map((i: { name: string }) => i.name).join(', ') : 'Meal'}</h3>
          <div className="mt-1 text-xs text-gray-500">{format(new Date(log.eaten_at), 'PPp')}</div>
        </div>
        {onDelete ? (
          <button
            onClick={() => onDelete(log.id)}
            className="text-red-600 text-xs border border-red-200 rounded-md px-2 py-1 hover:bg-red-50"
            aria-label="Delete log"
          >
            Delete
          </button>
        ) : null}
      </div>
      <div className="mt-2 text-sm text-gray-700">
        <p>{Math.round(Number(log.calories))} kcal • P {Math.round(Number(log.protein_g))}g • C {Math.round(Number(log.carbs_g))}g • F {Math.round(Number(log.fat_g))}g</p>
        {log.note ? <p className="text-gray-600 mt-1">“{log.note}”</p> : null}
      </div>
    </div>
  );
}
