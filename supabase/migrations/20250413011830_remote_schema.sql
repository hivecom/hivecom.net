CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

GRANT DELETE ON TABLE "storage"."s3_multipart_uploads" TO "postgres";

GRANT INSERT ON TABLE "storage"."s3_multipart_uploads" TO "postgres";

GRANT REFERENCES ON TABLE "storage"."s3_multipart_uploads" TO "postgres";

GRANT SELECT ON TABLE "storage"."s3_multipart_uploads" TO "postgres";

GRANT TRIGGER ON TABLE "storage"."s3_multipart_uploads" TO "postgres";

GRANT TRUNCATE ON TABLE "storage"."s3_multipart_uploads" TO "postgres";

GRANT UPDATE ON TABLE "storage"."s3_multipart_uploads" TO "postgres";

GRANT DELETE ON TABLE "storage"."s3_multipart_uploads_parts" TO "postgres";

GRANT INSERT ON TABLE "storage"."s3_multipart_uploads_parts" TO "postgres";

GRANT REFERENCES ON TABLE "storage"."s3_multipart_uploads_parts" TO "postgres";

GRANT SELECT ON TABLE "storage"."s3_multipart_uploads_parts" TO "postgres";

GRANT TRIGGER ON TABLE "storage"."s3_multipart_uploads_parts" TO "postgres";

GRANT TRUNCATE ON TABLE "storage"."s3_multipart_uploads_parts" TO "postgres";

GRANT UPDATE ON TABLE "storage"."s3_multipart_uploads_parts" TO "postgres";

