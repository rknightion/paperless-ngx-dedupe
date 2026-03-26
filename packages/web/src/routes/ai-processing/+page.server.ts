import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url }) => {
  const params = url.searchParams.toString();
  redirect(302, `/ai-processing/review${params ? `?${params}` : ''}`);
};
