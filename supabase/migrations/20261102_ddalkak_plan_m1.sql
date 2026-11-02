-- 딸깍 1개월 이용권(m1) 추가: 월 9,900원 기준 요금제
alter table ddalkak_licenses drop constraint if exists ddalkak_licenses_plan_check;
alter table ddalkak_licenses add constraint ddalkak_licenses_plan_check check (plan in ('trial1','m1','m3','m6','m9','m12'));
