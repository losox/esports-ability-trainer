DROP FUNCTION IF EXISTS public.verify_and_reset_password();

CREATE FUNCTION public.verify_and_reset_password(
  p_email text,
  p_code text,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth, extensions
AS $$
DECLARE
  v_record public.password_reset_codes%rowtype;
  v_user_id uuid;
BEGIN
  SELECT * INTO v_record
  FROM public.password_reset_codes
  WHERE email = p_email
    AND is_used = false
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_record.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'invalid_code'
    );
  END IF;

  IF v_record.code != p_code THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'code_mismatch'
    );
  END IF;

  UPDATE public.password_reset_codes
  SET is_used = true, used_at = now()
  WHERE id = v_record.id;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
  WHERE lower(email) = lower(p_email)
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'user_not_found'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id
  );
END;
$$;