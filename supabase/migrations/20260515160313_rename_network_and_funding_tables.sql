-- Rename network-related tables
ALTER TABLE public.servers RENAME TO network_servers;
ALTER TABLE public.gameservers RENAME TO network_gameservers;
ALTER TABLE public.containers RENAME TO network_containers;

-- Rename funding-related tables
ALTER TABLE public.expenses RENAME TO funding_expenses;
ALTER TABLE public.monthly_funding RENAME TO funding_history;
