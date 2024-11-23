import { match } from "ts-pattern";
import { api } from "~/utils/api";
import { error, loading, success } from "~/utils/trcp/patterns";

export default function TestPage() {
  const offers = api.marketplace.trade.getOffers.useQuery();
  // const auth = api.auth.trx..useMutation();
  const offersComponent = match(offers)
    .with(loading, () => <div>Loading...</div>)
    .with(error, (e) => <div>Error: {e.error?.message}</div>)
    .with(success, (res) => <ul>hi</ul>)
    .otherwise(() => null);
  return (
    <div>
      {/* TestPage <MapApp /> */}
      {/* <button
        onClick={() =>
          auth.mutate({
            token:
              "***REMOVED***",
          })
        }
      >
        {auth.isLoading && <Loader2 className="animate-spin" />}
        Test Apple jwt verify
      </button> */}
    </div>
  );
}
