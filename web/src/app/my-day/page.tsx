import {redirect} from 'next/navigation';
import {getCurrentUser} from '@/lib/current-user';
export default async function MyDayPage(){
 const user=await getCurrentUser();if(!user)redirect('/login');
 redirect(`/follow-ups?owner=${user.id}`);
}
